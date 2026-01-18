import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndo } from "./use-undo";
import { toast } from "sonner";

// Mock sonner
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// Mock crypto.randomUUID
const mockUUID = "test-uuid-123";
vi.stubGlobal("crypto", {
  randomUUID: () => mockUUID,
});

describe("useUndo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return executeWithUndo, cancelUndo, and isUndoActive functions", () => {
    const { result } = renderHook(() => useUndo());

    expect(result.current.executeWithUndo).toBeInstanceOf(Function);
    expect(result.current.cancelUndo).toBeInstanceOf(Function);
    expect(result.current.isUndoActive).toBeInstanceOf(Function);
  });

  it("should execute the action and show toast with undo button", async () => {
    const { result } = renderHook(() => useUndo());
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: undoFn,
        message: "Item deleted",
        type: "delete_item",
        data: { id: "123" },
      });
    });

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Item deleted", {
      duration: 5000,
      action: expect.objectContaining({
        label: "Undo",
        onClick: expect.any(Function),
      }),
      onDismiss: expect.any(Function),
      onAutoClose: expect.any(Function),
    });
  });

  it("should use custom toast duration when provided", async () => {
    const { result } = renderHook(() => useUndo({ toastDuration: 10000 }));
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: undoFn,
        message: "Test action",
        type: "test",
      });
    });

    expect(toast).toHaveBeenCalledWith("Test action", expect.objectContaining({
      duration: 10000,
    }));
  });

  it("should call undo function when undo action is clicked", async () => {
    const { result } = renderHook(() => useUndo());
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: undoFn,
        message: "Item deleted",
        type: "delete_item",
      });
    });

    // Get the action onClick handler from the toast call
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger the undo
    await act(async () => {
      await actionOnClick();
    });

    expect(undoFn).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Action undone");
  });

  it("should dismiss toast when undo is clicked", async () => {
    const mockToastId = "toast-123";
    (toast as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockToastId);

    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    // Get the action onClick handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger undo
    await act(async () => {
      await actionOnClick();
    });

    expect(toast.dismiss).toHaveBeenCalledWith(mockToastId);
  });

  it("should not call undo function twice when clicked multiple times", async () => {
    const { result } = renderHook(() => useUndo());
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: undoFn,
        message: "Item deleted",
        type: "delete_item",
      });
    });

    // Get the action onClick handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger undo twice
    await act(async () => {
      await actionOnClick();
      await actionOnClick();
    });

    // Should only be called once
    expect(undoFn).toHaveBeenCalledTimes(1);
  });

  it("should return action ID from executeWithUndo", async () => {
    const { result } = renderHook(() => useUndo());

    let actionId: string | null | undefined;
    await act(async () => {
      actionId = await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    expect(actionId).toBe(mockUUID);
  });

  it("should return null when execute throws an error", async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => useUndo());
    const error = new Error("Execute failed");
    const executeFn = vi.fn().mockRejectedValue(error);
    const undoFn = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let actionId: string | null | undefined;
    await act(async () => {
      actionId = await result.current.executeWithUndo({
        execute: executeFn,
        undo: undoFn,
        message: "Test",
        type: "test_action",
      });
    });

    expect(actionId).toBeNull();
    expect(toast).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[useUndo] Failed to execute test_action action:",
      error
    );
    expect(result.current.isUndoActive(mockUUID)).toBe(false);

    consoleSpy.mockRestore();
  });

  it("should show error toast when undo throws an error", async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => useUndo());
    const undoError = new Error("Undo failed");
    const undoFn = vi.fn().mockRejectedValue(undoError);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: undoFn,
        message: "Test",
        type: "test_action",
      });
    });

    // Get the action onClick handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger undo
    await act(async () => {
      await actionOnClick();
    });

    expect(undoFn).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Failed to undo. Please refresh the page.");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[useUndo] Failed to undo test_action action:",
      undoError
    );

    consoleSpy.mockRestore();
  });

  it("should allow retry when undo fails", async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => useUndo());
    const undoFn = vi.fn()
      .mockRejectedValueOnce(new Error("First failure"))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: undoFn,
        message: "Test",
        type: "test",
      });
    });

    // Get the action onClick handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // First attempt - fails
    await act(async () => {
      await actionOnClick();
    });

    expect(undoFn).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalled();

    // Second attempt - succeeds
    await act(async () => {
      await actionOnClick();
    });

    expect(undoFn).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith("Action undone");
  });

  it("should track active undo actions", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    // Should be active before undo
    expect(result.current.isUndoActive(mockUUID)).toBe(true);
  });

  it("should remove action from active after undo is executed", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    // Get the action onClick handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger undo
    await act(async () => {
      await actionOnClick();
    });

    // Should no longer be active
    expect(result.current.isUndoActive(mockUUID)).toBe(false);
  });

  it("should cancel undo action with cancelUndo", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(true);

    // Cancel the undo
    act(() => {
      result.current.cancelUndo(mockUUID);
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(false);
  });

  it("should clean up action on toast dismiss", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(true);

    // Get the onDismiss handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const onDismiss = toastCall[1].onDismiss;

    // Trigger dismiss
    act(() => {
      onDismiss();
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(false);
  });

  it("should clean up action on toast auto-close", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(true);

    // Get the onAutoClose handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const onAutoClose = toastCall[1].onAutoClose;

    // Trigger auto-close
    act(() => {
      onAutoClose();
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(false);
  });

  it("should handle async execute functions", async () => {
    vi.useRealTimers();

    const { result } = renderHook(() => useUndo());
    const executeFn = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: vi.fn(),
        message: "Async action",
        type: "async",
      });
    });

    expect(executeFn).toHaveBeenCalled();
  });

  it("should handle async undo functions", async () => {
    vi.useRealTimers();

    const { result } = renderHook(() => useUndo());
    const undoFn = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: undoFn,
        message: "Test",
        type: "test",
      });
    });

    // Get the action onClick handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger undo
    await act(async () => {
      await actionOnClick();
    });

    expect(undoFn).toHaveBeenCalled();
  });

  it("should return stable function references across re-renders", () => {
    const { result, rerender } = renderHook(() => useUndo());

    const initial = { ...result.current };
    rerender();

    expect(result.current.executeWithUndo).toBe(initial.executeWithUndo);
    expect(result.current.cancelUndo).toBe(initial.cancelUndo);
    expect(result.current.isUndoActive).toBe(initial.isUndoActive);
  });

  it("should handle multiple concurrent undo actions independently", async () => {
    let uuidCounter = 0;
    vi.stubGlobal("crypto", {
      randomUUID: () => `uuid-${++uuidCounter}`,
    });

    const { result } = renderHook(() => useUndo());
    const undo1 = vi.fn();
    const undo2 = vi.fn();

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: undo1,
        message: "Action 1",
        type: "action1",
      });
    });

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: undo2,
        message: "Action 2",
        type: "action2",
      });
    });

    expect(result.current.isUndoActive("uuid-1")).toBe(true);
    expect(result.current.isUndoActive("uuid-2")).toBe(true);

    // Trigger first undo
    const toast1Call = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    await act(async () => {
      await toast1Call[1].action.onClick();
    });

    expect(undo1).toHaveBeenCalled();
    expect(undo2).not.toHaveBeenCalled();
    expect(result.current.isUndoActive("uuid-1")).toBe(false);
    expect(result.current.isUndoActive("uuid-2")).toBe(true);

    // Restore original mock
    vi.stubGlobal("crypto", {
      randomUUID: () => mockUUID,
    });
  });
});
