import { useCallback, useRef } from "react";
import { toast } from "sonner";

interface UndoableAction<T = unknown> {
  id: string;
  type: string;
  timestamp: number;
  data: T;
  undo: () => Promise<void> | void;
}

interface UseUndoOptions {
  /**
   * Duration in milliseconds before the toast auto-dismisses.
   * Default: 5000ms (5 seconds)
   */
  toastDuration?: number;
}

const DEFAULT_TOAST_DURATION = 5000;

/**
 * Hook for managing undoable actions with toast notifications.
 *
 * @example
 * ```tsx
 * const { executeWithUndo } = useUndo();
 *
 * const handleDelete = (item) => {
 *   executeWithUndo({
 *     execute: async () => {
 *       await deleteItem(item.id);
 *     },
 *     undo: async () => {
 *       await restoreItem(item);
 *     },
 *     message: "Item deleted",
 *     type: "delete_item",
 *     data: item,
 *   });
 * };
 * ```
 */
export function useUndo(options: UseUndoOptions = {}) {
  const { toastDuration = DEFAULT_TOAST_DURATION } = options;

  // Track active undo actions for status checking and cancellation
  const activeUndos = useRef<Map<string, UndoableAction>>(new Map());

  /**
   * Execute an action that can be undone.
   *
   * @param params - The parameters for the undoable action
   * @param params.execute - The function to execute the action. If it throws, no undo toast is shown.
   * @param params.undo - The function to undo the action
   * @param params.message - The message to display in the toast
   * @param params.type - Identifier for the action type (for debugging)
   * @param params.data - Optional data associated with the action (for debugging)
   * @returns The action ID (for use with cancelUndo/isUndoActive), or null if execute failed
   */
  const executeWithUndo = useCallback(
    async <T = unknown>({
      execute,
      undo,
      message,
      type,
      data,
    }: {
      execute: () => Promise<void> | void;
      undo: () => Promise<void> | void;
      message: string;
      type: string;
      data?: T;
    }): Promise<string | null> => {
      const actionId = crypto.randomUUID();
      let isUndone = false;

      // Execute the action first - if this fails, don't register undo
      try {
        await execute();
      } catch (error) {
        console.error(`[useUndo] Failed to execute ${type} action:`, error);
        return null;
      }

      const action: UndoableAction<T | undefined> = {
        id: actionId,
        type,
        timestamp: Date.now(),
        data,
        undo: async () => {
          if (isUndone) return;
          try {
            await undo();
            // Only mark as undone after successful undo
            isUndone = true;
            activeUndos.current.delete(actionId);
          } catch (error) {
            // Don't mark as undone - user can retry
            console.error(`[useUndo] Failed to undo ${type} action:`, error);
            throw error;
          }
        },
      };

      activeUndos.current.set(actionId, action);

      const toastId = toast(message, {
        duration: toastDuration,
        action: {
          label: "Undo",
          onClick: async () => {
            toast.dismiss(toastId);
            try {
              await action.undo();
              toast.success("Action undone");
            } catch (error) {
              console.error("[useUndo] Undo failed in onClick:", error);
              toast.error("Failed to undo. Please refresh the page.");
            }
          },
        },
        onDismiss: () => {
          activeUndos.current.delete(actionId);
        },
        onAutoClose: () => {
          activeUndos.current.delete(actionId);
        },
      });

      return actionId;
    },
    [toastDuration]
  );

  /**
   * Remove an undo action from tracking (affects isUndoActive checks).
   * Note: This does NOT dismiss the toast or prevent the undo from executing
   * if the user clicks the button - the undo callback closure remains active.
   */
  const cancelUndo = useCallback((actionId: string) => {
    activeUndos.current.delete(actionId);
  }, []);

  /**
   * Check if an undo action is still active.
   */
  const isUndoActive = useCallback((actionId: string) => {
    return activeUndos.current.has(actionId);
  }, []);

  return {
    executeWithUndo,
    cancelUndo,
    isUndoActive,
  };
}
