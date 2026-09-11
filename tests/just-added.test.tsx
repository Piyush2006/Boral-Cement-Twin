import { act, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AddedBanner, useJustAdded } from "@/components/shell/just-added"

describe("just added — a saved item shows in its list", () => {
  it("marks one row, says what was added, and clears", () => {
    const { result } = renderHook(() => useJustAdded())
    expect(result.current.id).toBeNull()
    act(() => result.current.mark("RM-LS-002", "Inventory RM-LS-002 created"))
    expect(result.current.is("RM-LS-002")).toBe(true)
    expect(result.current.is("RM-LS-001")).toBe(false)
    expect(result.current.rowClass("RM-LS-002")).toBe("added-row")
    expect(result.current.rowClass("RM-LS-001")).toBe("")
    expect(result.current.message).toBe("Inventory RM-LS-002 created")
    act(() => result.current.clear())
    expect(result.current.id).toBeNull()
  })

  it("the highlight fades on its own, and a newer save replaces an older one", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useJustAdded())
    act(() => result.current.mark("A", "first"))
    act(() => vi.advanceTimersByTime(5000))
    act(() => result.current.mark("B", "second"))
    act(() => vi.advanceTimersByTime(5000))
    // The first timer must not clear the second item.
    expect(result.current.id).toBe("B")
    act(() => vi.advanceTimersByTime(4000))
    expect(result.current.id).toBeNull()
    vi.useRealTimers()
  })

  it("the banner is a status message with a dismiss button", () => {
    function Harness() {
      const added = useJustAdded()
      return (
        <>
          <button onClick={() => added.mark("L-1", "Location L-1 added")}>save</button>
          <AddedBanner added={added} />
        </>
      )
    }
    render(<Harness />)
    expect(screen.queryByRole("status")).toBeNull()
    act(() => screen.getByText("save").click())
    expect(screen.getByRole("status").textContent).toContain("Location L-1 added")
    act(() => screen.getByRole("button", { name: "Dismiss" }).click())
    expect(screen.queryByRole("status")).toBeNull()
  })
})
