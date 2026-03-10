export interface TargetApp {
  appName: string;
  bundleId: string;
}

export interface WorkflowProcessedSession {
  id: string;
  rewrite: {
    text: string;
  } | null;
}

export interface WorkflowControllerDeps<TSession extends WorkflowProcessedSession = WorkflowProcessedSession> {
  detectTargetApp: () => Promise<TargetApp | null>;
  processSession: (sessionId: string) => Promise<TSession>;
  insertText: (text: string, target: TargetApp) => Promise<void>;
}

export interface WorkflowCompletionResult<TSession extends WorkflowProcessedSession = WorkflowProcessedSession> {
  inserted: boolean;
  processed: TSession;
  target: TargetApp | null;
}

export interface WorkflowController<TSession extends WorkflowProcessedSession = WorkflowProcessedSession> {
  beginCapture: () => Promise<TargetApp | null>;
  getActiveTarget: () => TargetApp | null;
  processAndInsertSession: (sessionId: string) => Promise<WorkflowCompletionResult<TSession>>;
  reset: () => void;
}

export function createWorkflowController<TSession extends WorkflowProcessedSession>(
  deps: WorkflowControllerDeps<TSession>
): WorkflowController<TSession> {
  let activeTarget: TargetApp | null = null;

  return {
    async beginCapture(): Promise<TargetApp | null> {
      activeTarget = await deps.detectTargetApp();
      return activeTarget;
    },

    getActiveTarget(): TargetApp | null {
      return activeTarget;
    },

    async processAndInsertSession(sessionId: string): Promise<WorkflowCompletionResult<TSession>> {
      const target = activeTarget;
      const processed = await deps.processSession(sessionId);

      try {
        if (target && processed.rewrite?.text) {
          await deps.insertText(processed.rewrite.text, target);
          return {
            inserted: true,
            processed,
            target
          };
        }

        return {
          inserted: false,
          processed,
          target
        };
      } finally {
        activeTarget = null;
      }
    },

    reset(): void {
      activeTarget = null;
    }
  };
}
