'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { api } from '@/lib/api';
import { useSettings } from '@/lib/contexts/SettingsContext';
import { ProjectCreationModal } from '@/components/project-wizard/ProjectCreationModal';

interface Project {
  id: string;
  name: string;
  template: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { openModal } = useSettings();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; projectId: string; projectName: string }>({
    show: false,
    projectId: '',
    projectName: ''
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Set up API token getter and load projects
  useEffect(() => {
    if (getToken) {
      api.setTokenGetter(getToken);
    }

    if (isLoaded && isSignedIn && getToken) {
      loadProjects();
    }
  }, [getToken, isLoaded, isSignedIn]);

  async function loadProjects() {
    try {
      const response = await api.listProjects();
      if (response.projects) {
        setProjects(response.projects);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }

  function openProject(projectId: string) {
    router.push(`/editor/${projectId}`);
  }

  function createNewProject() {
    setIsWizardOpen(true);
  }

  function handleProjectCreated(projectId: string) {
    setIsWizardOpen(false);
    loadProjects(); // Reload project list
    router.push(`/editor/${projectId}`);
  }

  function showDeleteConfirmation(projectId: string, projectName: string, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent opening the project
    setDeleteConfirm({ show: true, projectId, projectName });
  }

  async function handleDeleteProject() {
    if (!deleteConfirm.projectId) return;

    setIsDeleting(true);
    try {
      await api.deleteProject(deleteConfirm.projectId);
      setDeleteConfirm({ show: false, projectId: '', projectName: '' });
      await loadProjects(); // Reload project list
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  }

  function cancelDelete() {
    setDeleteConfirm({ show: false, projectId: '', projectName: '' });
  }

  if (!isLoaded || loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--vf-bg-primary)',
        color: 'var(--vf-text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--vf-font-display)'
      }}>
        <div style={{
          color: 'var(--vf-accent-primary)',
          fontSize: 'var(--vf-text-2xl)',
          fontWeight: 'var(--vf-weight-bold)',
          letterSpacing: '0.05em'
        }}>
          LOADING...
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--vf-bg-primary)',
        color: 'var(--vf-text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--vf-font-display)'
      }}>
        <div style={{
          color: 'var(--vf-accent-danger)',
          fontSize: 'var(--vf-text-2xl)',
          fontWeight: 'var(--vf-weight-bold)',
          letterSpacing: '0.05em'
        }}>
          PLEASE SIGN IN
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--vf-bg-primary)',
      color: 'var(--vf-text-primary)',
      fontFamily: 'var(--vf-font-body)'
    }}>
      {/* Header Bar */}
      <div style={{
        borderBottom: '3px solid var(--vf-border-primary)',
        padding: 'var(--vf-space-6) var(--vf-space-8)',
        background: 'var(--vf-bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--vf-font-display)',
            fontSize: '2.5rem',
            fontWeight: 'var(--vf-weight-black)',
            marginBottom: 'var(--vf-space-1)',
            letterSpacing: '-0.02em',
            textShadow: '0 0 20px rgba(202, 196, 183, 0.1)'
          }}>
            VAPORFORM
          </h1>
          <p style={{
            color: 'var(--vf-text-secondary)',
            fontSize: 'var(--vf-text-sm)',
            fontWeight: 'var(--vf-weight-medium)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            AI-POWERED DEVELOPMENT ENVIRONMENT
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--vf-space-3)' }}>
          <button
            onClick={openModal}
            style={{
              padding: 'var(--vf-space-3) var(--vf-space-6)',
              border: '2px solid var(--vf-border-primary)',
              background: 'transparent',
              color: 'var(--vf-text-primary)',
              fontFamily: 'var(--vf-font-display)',
              fontWeight: 'var(--vf-weight-bold)',
              fontSize: 'var(--vf-text-sm)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all var(--vf-transition-fast)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--vf-space-2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--vf-accent-primary)';
              e.currentTarget.style.color = 'var(--vf-accent-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--vf-border-primary)';
              e.currentTarget.style.color = 'var(--vf-text-primary)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
            </svg>
            SETTINGS
          </button>
          <button
            onClick={createNewProject}
          style={{
            padding: 'var(--vf-space-3) var(--vf-space-6)',
            border: '2px solid var(--vf-accent-primary)',
            background: 'var(--vf-accent-primary)',
            color: 'var(--vf-bg-primary)',
            fontFamily: 'var(--vf-font-display)',
            fontWeight: 'var(--vf-weight-bold)',
            fontSize: 'var(--vf-text-sm)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all var(--vf-transition-fast)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--vf-space-2)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vf-accent-active)';
            e.currentTarget.style.borderColor = 'var(--vf-accent-active)';
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(202, 196, 183, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--vf-accent-primary)';
            e.currentTarget.style.borderColor = 'var(--vf-accent-primary)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          NEW PROJECT
          </button>
        </div>
      </div>

      {/* Dashboard Content */}
      <div style={{ padding: 'var(--vf-space-8)' }}>
        {/* Stats Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--vf-space-4)',
          marginBottom: 'var(--vf-space-8)'
        }}>
          <div style={{
            border: '2px solid var(--vf-border-primary)',
            padding: 'var(--vf-space-4)',
            background: 'var(--vf-bg-secondary)'
          }}>
            <div style={{
              fontSize: 'var(--vf-text-xs)',
              color: 'var(--vf-text-muted)',
              fontFamily: 'var(--vf-font-display)',
              fontWeight: 'var(--vf-weight-bold)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 'var(--vf-space-2)'
            }}>
              TOTAL PROJECTS
            </div>
            <div style={{
              fontSize: 'var(--vf-text-4xl)',
              fontFamily: 'var(--vf-font-display)',
              fontWeight: 'var(--vf-weight-black)',
              color: 'var(--vf-accent-primary)',
              letterSpacing: '-0.02em'
            }}>
              {projects.length}
            </div>
          </div>
          <div style={{
            border: '2px solid var(--vf-border-primary)',
            padding: 'var(--vf-space-4)',
            background: 'var(--vf-bg-secondary)'
          }}>
            <div style={{
              fontSize: 'var(--vf-text-xs)',
              color: 'var(--vf-text-muted)',
              fontFamily: 'var(--vf-font-display)',
              fontWeight: 'var(--vf-weight-bold)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 'var(--vf-space-2)'
            }}>
              ACTIVE TODAY
            </div>
            <div style={{
              fontSize: 'var(--vf-text-4xl)',
              fontFamily: 'var(--vf-font-display)',
              fontWeight: 'var(--vf-weight-black)',
              color: 'var(--vf-accent-secondary)',
              letterSpacing: '-0.02em'
            }}>
              {projects.length > 0 ? 1 : 0}
            </div>
          </div>
        </div>

        {/* Projects Section */}
        <div style={{
          border: '3px solid var(--vf-border-primary)',
          background: 'var(--vf-bg-secondary)'
        }}>
          <div style={{
            padding: 'var(--vf-space-4) var(--vf-space-6)',
            borderBottom: '2px solid var(--vf-border-primary)',
            background: 'var(--vf-bg-tertiary)'
          }}>
            <h2 style={{
              fontFamily: 'var(--vf-font-display)',
              fontSize: 'var(--vf-text-xl)',
              fontWeight: 'var(--vf-weight-bold)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              margin: 0
            }}>
              YOUR PROJECTS
            </h2>
          </div>

          {projects.length === 0 ? (
            <div style={{
              padding: 'var(--vf-space-12)',
              textAlign: 'center'
            }}>
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--vf-text-muted)"
                strokeWidth="1.5"
                style={{ margin: '0 auto var(--vf-space-4)' }}
              >
                <path d="M3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7l9-5 9 5M3 7v.01M21 7v.01" />
                <path d="M9 21v-8a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8" />
              </svg>
              <p style={{
                color: 'var(--vf-text-muted)',
                fontSize: 'var(--vf-text-lg)',
                fontWeight: 'var(--vf-weight-medium)',
                letterSpacing: '0.02em',
                marginBottom: 'var(--vf-space-4)'
              }}>
                NO PROJECTS YET
              </p>
              <button
                onClick={createNewProject}
                style={{
                  padding: 'var(--vf-space-3) var(--vf-space-6)',
                  border: '2px solid var(--vf-accent-primary)',
                  background: 'transparent',
                  color: 'var(--vf-accent-primary)',
                  fontFamily: 'var(--vf-font-display)',
                  fontWeight: 'var(--vf-weight-bold)',
                  fontSize: 'var(--vf-text-sm)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all var(--vf-transition-fast)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--vf-space-2)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--vf-accent-primary)';
                  e.currentTarget.style.color = 'var(--vf-bg-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--vf-accent-primary)';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                CREATE YOUR FIRST PROJECT
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '0'
            }}>
              {projects.map((project, index) => (
                <div
                  key={project.id}
                  onClick={() => openProject(project.id)}
                  style={{
                    borderRight: (index + 1) % 3 !== 0 ? '2px solid var(--vf-border-primary)' : 'none',
                    borderBottom: index < projects.length - 3 ? '2px solid var(--vf-border-primary)' : 'none',
                    padding: 'var(--vf-space-6)',
                    cursor: 'pointer',
                    transition: 'all var(--vf-transition-fast)',
                    background: 'var(--vf-bg-secondary)',
                    position: 'relative' as const
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--vf-bg-elevated)';
                    e.currentTarget.style.borderColor = 'var(--vf-accent-primary)';
                    e.currentTarget.style.zIndex = '10';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--vf-bg-secondary)';
                    e.currentTarget.style.borderColor = 'var(--vf-border-primary)';
                    e.currentTarget.style.zIndex = '1';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--vf-space-3)'
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      border: '2px solid var(--vf-accent-primary)',
                      background: 'var(--vf-bg-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-primary)" strokeWidth="2">
                        <path d="M3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7l9-5 9 5M3 7v.01M21 7v.01" />
                      </svg>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--vf-space-2)' }}>
                      <button
                        onClick={(e) => showDeleteConfirmation(project.id, project.name, e)}
                        style={{
                          width: '28px',
                          height: '28px',
                          padding: '0',
                          border: '2px solid var(--vf-border-primary)',
                          background: 'transparent',
                          cursor: 'pointer',
                          transition: 'all var(--vf-transition-fast)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--vf-accent-danger)';
                          e.currentTarget.style.background = 'var(--vf-accent-danger)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--vf-border-primary)';
                          e.currentTarget.style.background = 'transparent';
                        }}
                        title="Delete project"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--vf-text-muted)" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </div>
                  <h3 style={{
                    fontFamily: 'var(--vf-font-display)',
                    fontWeight: 'var(--vf-weight-bold)',
                    fontSize: 'var(--vf-text-lg)',
                    marginBottom: 'var(--vf-space-2)',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    color: 'var(--vf-text-primary)'
                  }}>
                    {project.name}
                  </h3>
                  <div style={{
                    fontSize: 'var(--vf-text-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--vf-space-2)',
                    fontFamily: 'var(--vf-font-mono)'
                  }}>
                    {project.template && (
                      <div style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        background: 'var(--vf-bg-primary)',
                        border: '1px solid var(--vf-accent-primary)',
                        color: 'var(--vf-accent-primary)',
                        fontSize: 'var(--vf-text-2xs)',
                        fontWeight: 'var(--vf-weight-bold)',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        width: 'fit-content'
                      }}>
                        {project.template}
                      </div>
                    )}
                    <p style={{ color: 'var(--vf-text-muted)', margin: 0 }}>
                      ID: {project.id}
                    </p>
                    <p style={{ color: 'var(--vf-text-muted)', margin: 0 }}>
                      CREATED: {new Date(project.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Project Creation Wizard */}
      <ProjectCreationModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleProjectCreated}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          fontFamily: 'var(--vf-font-body)'
        }}>
          <div style={{
            background: 'var(--vf-bg-secondary)',
            border: '3px solid var(--vf-border-primary)',
            maxWidth: '500px',
            width: '90%'
          }}>
            {/* Header */}
            <div style={{
              padding: 'var(--vf-space-6)',
              borderBottom: '2px solid var(--vf-border-primary)',
              background: 'var(--vf-bg-tertiary)'
            }}>
              <h2 style={{
                margin: 0,
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xl)',
                fontWeight: 'var(--vf-weight-bold)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--vf-accent-danger)'
              }}>
                DELETE PROJECT
              </h2>
            </div>

            {/* Content */}
            <div style={{
              padding: 'var(--vf-space-6)'
            }}>
              <div style={{
                marginBottom: 'var(--vf-space-6)',
                padding: 'var(--vf-space-4)',
                border: '2px solid var(--vf-accent-danger)',
                background: 'var(--vf-bg-primary)'
              }}>
                <p style={{
                  margin: 0,
                  marginBottom: 'var(--vf-space-3)',
                  fontSize: 'var(--vf-text-base)',
                  color: 'var(--vf-text-primary)',
                  fontWeight: 'var(--vf-weight-medium)'
                }}>
                  Are you sure you want to delete this project?
                </p>
                <p style={{
                  margin: 0,
                  marginBottom: 'var(--vf-space-3)',
                  fontSize: 'var(--vf-text-lg)',
                  fontFamily: 'var(--vf-font-display)',
                  fontWeight: 'var(--vf-weight-bold)',
                  color: 'var(--vf-accent-primary)',
                  letterSpacing: '0.02em'
                }}>
                  {deleteConfirm.projectName}
                </p>
                <p style={{
                  margin: 0,
                  fontSize: 'var(--vf-text-sm)',
                  color: 'var(--vf-text-secondary)',
                  lineHeight: '1.5'
                }}>
                  This will permanently delete:
                </p>
                <ul style={{
                  margin: 'var(--vf-space-2) 0 0 var(--vf-space-4)',
                  padding: 0,
                  fontSize: 'var(--vf-text-sm)',
                  color: 'var(--vf-text-secondary)',
                  lineHeight: '1.6'
                }}>
                  <li>All project files and code</li>
                  <li>Chat history and conversations</li>
                  <li>Daytona sandbox environment</li>
                  <li>Vector embeddings and AI data</li>
                  <li>Build history and logs</li>
                </ul>
              </div>

              <p style={{
                margin: 0,
                marginBottom: 'var(--vf-space-6)',
                fontSize: 'var(--vf-text-sm)',
                color: 'var(--vf-accent-danger)',
                fontWeight: 'var(--vf-weight-bold)',
                letterSpacing: '0.02em',
                textTransform: 'uppercase'
              }}>
                This action cannot be undone!
              </p>

              {/* Actions */}
              <div style={{
                display: 'flex',
                gap: 'var(--vf-space-3)',
                justifyContent: 'flex-end'
              }}>
                <button
                  onClick={cancelDelete}
                  disabled={isDeleting}
                  style={{
                    padding: 'var(--vf-space-3) var(--vf-space-6)',
                    border: '2px solid var(--vf-border-primary)',
                    background: 'transparent',
                    color: 'var(--vf-text-primary)',
                    fontFamily: 'var(--vf-font-display)',
                    fontWeight: 'var(--vf-weight-bold)',
                    fontSize: 'var(--vf-text-sm)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    transition: 'all var(--vf-transition-fast)',
                    opacity: isDeleting ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!isDeleting) {
                      e.currentTarget.style.background = 'var(--vf-bg-elevated)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleDeleteProject}
                  disabled={isDeleting}
                  style={{
                    padding: 'var(--vf-space-3) var(--vf-space-6)',
                    border: '2px solid var(--vf-accent-danger)',
                    background: 'var(--vf-accent-danger)',
                    color: 'var(--vf-bg-primary)',
                    fontFamily: 'var(--vf-font-display)',
                    fontWeight: 'var(--vf-weight-bold)',
                    fontSize: 'var(--vf-text-sm)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    transition: 'all var(--vf-transition-fast)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--vf-space-2)',
                    opacity: isDeleting ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!isDeleting) {
                      e.currentTarget.style.background = '#cc0000';
                      e.currentTarget.style.borderColor = '#cc0000';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--vf-accent-danger)';
                    e.currentTarget.style.borderColor = 'var(--vf-accent-danger)';
                  }}
                >
                  {isDeleting ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
                      </svg>
                      DELETING...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      DELETE PROJECT
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
