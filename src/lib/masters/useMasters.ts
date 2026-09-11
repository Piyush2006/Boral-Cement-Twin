"use client"

/**
 * React access to the master registry.
 *
 * Components read masters through this hook so that registering a material,
 * grade or location updates every screen at once — the same contract the
 * ledger has with inventory.
 */

import { useSyncExternalStore } from "react"
import { allMasters, subscribeMasters } from "./registry"

const subscribe = (fn: () => void) => subscribeMasters(fn)
const snapshot = () => allMasters()

export function useMasters() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
