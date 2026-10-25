import test from "node:test"
import assert from "node:assert/strict"
import { filterAndSortValidators, toggleSelection } from "./validatorOps"

const rows = [
  { address: "a", name: "Alpha", commission: 1, total_stake_pot: 100, own_pot: 90, nominators: 1, points: 10, tier: "WATCH" },
  { address: "b", name: "Beta", commission: 0, total_stake_pot: 200, own_pot: 180, nominators: 3, points: 20, tier: "SAFE" },
]

test("filters active low risk and watch categories", () => {
  assert.equal(filterAndSortValidators(rows, { category: "low", search: "", sort: "stake" }).length, 1)
  assert.equal(filterAndSortValidators(rows, { category: "watch", search: "", sort: "stake" }).length, 1)
  assert.equal(filterAndSortValidators(rows, { category: "active", search: "", sort: "stake" }).length, 2)
})

test("search matches name or full address", () => {
  assert.equal(filterAndSortValidators(rows, { category: "all", search: "alph", sort: "stake" })[0].address, "a")
  assert.equal(filterAndSortValidators(rows, { category: "all", search: "b", sort: "stake" })[0].address, "b")
})

test("sorts by stake commission nominators and risk", () => {
  assert.equal(filterAndSortValidators(rows, { category: "all", search: "", sort: "stake" })[0].address, "b")
  assert.equal(filterAndSortValidators(rows, { category: "all", search: "", sort: "commission" })[0].address, "b")
  assert.equal(filterAndSortValidators(rows, { category: "all", search: "", sort: "nominators" })[0].address, "b")
})

test("selection is capped at two validators", () => {
  assert.deepEqual(toggleSelection(["a"], "b"), ["a", "b"])
  assert.deepEqual(toggleSelection(["a", "b"], "c"), ["a", "b"])
  assert.deepEqual(toggleSelection(["a", "b"], "a"), ["b"])
})
