/**
 * Build Error Parser
 * Parses build errors from various languages and provides structured feedback
 */

export interface ParsedError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: 'syntax' | 'type' | 'import' | 'runtime' | 'other';
  suggestion?: string;
  code?: string;
}

export class BuildErrorParser {
  /**
   * Parse TypeScript/JavaScript errors
   */
  parseTypeScriptErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];

    // Match: src/file.ts(42,10): error TS2304: Cannot find name 'foo'.
    const tsRegex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/gm;

    let match;
    while ((match = tsRegex.exec(output)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4] as 'error' | 'warning',
        category: this.categorizeTSError(match[5]),
        message: match[6],
        code: `TS${match[5]}`,
        suggestion: this.suggestTSFix(match[5], match[6])
      });
    }

    // Also match ESLint-style errors: /path/file.ts:42:10: error message
    const eslintRegex = /^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.+)$/gm;

    while ((match = eslintRegex.exec(output)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4] as 'error' | 'warning',
        category: 'other',
        message: match[5]
      });
    }

    return errors;
  }

  /**
   * Parse Python errors
   */
  parsePythonErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];

    // Match: File "src/main.py", line 42
    //   SyntaxError: invalid syntax
    const pyRegex = /File "(.+?)", line (\d+).*?\n\s*(.+?)\n([A-Z]\w+Error):\s+(.+)/gs;

    let match;
    while ((match = pyRegex.exec(output)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: 0,
        severity: 'error',
        category: this.categorizePythonError(match[4]),
        message: `${match[4]}: ${match[5]}`,
        suggestion: this.suggestPythonFix(match[4], match[5])
      });
    }

    // Also match pytest errors: tests/test_file.py::test_name FAILED
    const pytestRegex = /^(.+?)::(.+?)\s+FAILED.*?\n.*?E\s+(.+)$/gm;

    while ((match = pytestRegex.exec(output)) !== null) {
      errors.push({
        file: match[1],
        line: 0,
        column: 0,
        severity: 'error',
        category: 'runtime',
        message: `Test failed: ${match[2]} - ${match[3]}`
      });
    }

    return errors;
  }

  /**
   * Parse Rust errors
   */
  parseRustErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];

    // Match: error[E0425]: cannot find value `foo` in this scope
    //  --> src/main.rs:42:5
    const rustRegex = /(error|warning)\[([^\]]+)\]: (.+)\n\s+-->\s+(.+?):(\d+):(\d+)/g;

    let match;
    while ((match = rustRegex.exec(output)) !== null) {
      errors.push({
        file: match[4],
        line: parseInt(match[5]),
        column: parseInt(match[6]),
        severity: match[1] as 'error' | 'warning',
        category: this.categorizeRustError(match[2]),
        message: match[3],
        code: match[2],
        suggestion: this.suggestRustFix(match[2], match[3])
      });
    }

    return errors;
  }

  /**
   * Parse Go errors
   */
  parseGoErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];

    // Match: ./main.go:42:10: undefined: foo
    const goRegex = /^(.+?):(\d+):(\d+):\s+(.+)$/gm;

    let match;
    while ((match = goRegex.exec(output)) !== null) {
      const message = match[4];
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: 'error',
        category: this.categorizeGoError(message),
        message,
        suggestion: this.suggestGoFix(message)
      });
    }

    return errors;
  }

  /**
   * Parse Java errors
   */
  parseJavaErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];

    // Match: src/Main.java:42: error: cannot find symbol
    const javaRegex = /^(.+?):(\d+):\s+(error|warning):\s+(.+)$/gm;

    let match;
    while ((match = javaRegex.exec(output)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: 0,
        severity: match[3] as 'error' | 'warning',
        category: this.categorizeJavaError(match[4]),
        message: match[4]
      });
    }

    return errors;
  }

  /**
   * Categorize TypeScript error by code
   */
  private categorizeTSError(code: string): ParsedError['category'] {
    // Import errors
    if (['2304', '2307', '2306', '2345'].includes(code)) return 'import';

    // Type errors
    if (['2339', '2551', '2322', '2345', '2769'].includes(code)) return 'type';

    // Syntax errors
    if (['1005', '1127', '1128', '1161', '1003'].includes(code)) return 'syntax';

    return 'other';
  }

  /**
   * Suggest fixes for TypeScript errors
   */
  private suggestTSFix(code: string, message: string): string | undefined {
    if (code === '2304') {
      const match = message.match(/Cannot find name '(.+?)'/);
      if (match) {
        return `Did you forget to import '${match[1]}'? Or check if it's defined in scope.`;
      }
    }

    if (code === '2307') {
      const match = message.match(/Cannot find module '(.+?)'/);
      if (match) {
        return `Check if the module '${match[1]}' is installed: npm install ${match[1]}`;
      }
    }

    if (code === '2339') {
      const match = message.match(/Property '(.+?)' does not exist/);
      if (match) {
        return `Check the property name '${match[1]}' for typos or if the type definition is correct.`;
      }
    }

    if (code === '2322') {
      return `Type mismatch. Check if the assigned value matches the expected type.`;
    }

    return undefined;
  }

  /**
   * Categorize Python error by type
   */
  private categorizePythonError(errorType: string): ParsedError['category'] {
    if (errorType === 'SyntaxError' || errorType === 'IndentationError') return 'syntax';
    if (errorType === 'ImportError' || errorType === 'ModuleNotFoundError') return 'import';
    if (errorType === 'TypeError' || errorType === 'AttributeError' || errorType === 'NameError') return 'type';
    return 'runtime';
  }

  /**
   * Suggest fixes for Python errors
   */
  private suggestPythonFix(errorType: string, message: string): string | undefined {
    if (errorType === 'ModuleNotFoundError') {
      const match = message.match(/No module named '(.+?)'/);
      if (match) {
        return `Install the module: pip install ${match[1]}`;
      }
    }

    if (errorType === 'IndentationError') {
      return `Check your indentation. Python requires consistent spacing (use 4 spaces).`;
    }

    if (errorType === 'NameError') {
      const match = message.match(/name '(.+?)' is not defined/);
      if (match) {
        return `'${match[1]}' is not defined. Did you forget to import it or define it earlier?`;
      }
    }

    return undefined;
  }

  /**
   * Categorize Rust error by code
   */
  private categorizeRustError(code: string): ParsedError['category'] {
    if (code.startsWith('E0425') || code.startsWith('E0433')) return 'import';
    if (code.startsWith('E0308') || code.startsWith('E0277')) return 'type';
    if (code.startsWith('E0412') || code.startsWith('E0106')) return 'syntax';
    return 'other';
  }

  /**
   * Suggest fixes for Rust errors
   */
  private suggestRustFix(code: string, message: string): string | undefined {
    if (code === 'E0425') {
      return `Cannot find value in scope. Did you forget to import it or declare it?`;
    }

    if (code === 'E0433') {
      return `Failed to resolve import. Check your use statements and Cargo.toml dependencies.`;
    }

    if (code === 'E0308') {
      return `Mismatched types. Check if the value matches the expected type.`;
    }

    return undefined;
  }

  /**
   * Categorize Go error by message
   */
  private categorizeGoError(message: string): ParsedError['category'] {
    if (message.includes('undefined:') || message.includes('not defined')) return 'import';
    if (message.includes('cannot use') || message.includes('type')) return 'type';
    if (message.includes('syntax error')) return 'syntax';
    return 'other';
  }

  /**
   * Suggest fixes for Go errors
   */
  private suggestGoFix(message: string): string | undefined {
    if (message.includes('undefined:')) {
      return `Symbol is undefined. Did you forget to import the package?`;
    }

    if (message.includes('cannot use')) {
      return `Type mismatch. Check if the types are compatible.`;
    }

    return undefined;
  }

  /**
   * Categorize Java error by message
   */
  private categorizeJavaError(message: string): ParsedError['category'] {
    if (message.includes('cannot find symbol')) return 'import';
    if (message.includes('incompatible types')) return 'type';
    if (message.includes('expected')) return 'syntax';
    return 'other';
  }

  /**
   * Auto-detect language and parse errors
   */
  parseErrors(output: string, language?: string): ParsedError[] {
    if (language) {
      switch (language.toLowerCase()) {
        case 'typescript':
        case 'javascript':
        case 'ts':
        case 'js':
          return this.parseTypeScriptErrors(output);
        case 'python':
        case 'py':
          return this.parsePythonErrors(output);
        case 'rust':
        case 'rs':
          return this.parseRustErrors(output);
        case 'go':
          return this.parseGoErrors(output);
        case 'java':
          return this.parseJavaErrors(output);
      }
    }

    // Try all parsers and combine results
    const allErrors = [
      ...this.parseTypeScriptErrors(output),
      ...this.parsePythonErrors(output),
      ...this.parseRustErrors(output),
      ...this.parseGoErrors(output),
      ...this.parseJavaErrors(output)
    ];

    // Remove duplicates based on file, line, message
    const unique = allErrors.filter((error, index, self) =>
      index === self.findIndex(e =>
        e.file === error.file &&
        e.line === error.line &&
        e.message === error.message
      )
    );

    return unique;
  }

  /**
   * Format errors for display
   */
  formatErrors(errors: ParsedError[]): string {
    if (errors.length === 0) {
      return 'No errors found.';
    }

    const lines: string[] = [];
    lines.push(`Found ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}:\n`);

    for (const error of errors) {
      const location = `${error.file}:${error.line}:${error.column}`;
      const severity = error.severity.toUpperCase();
      const code = error.code ? ` [${error.code}]` : '';

      lines.push(`${severity}${code}: ${location}`);
      lines.push(`  ${error.message}`);

      if (error.suggestion) {
        lines.push(`  💡 Suggestion: ${error.suggestion}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }
}

export const buildErrorParser = new BuildErrorParser();
