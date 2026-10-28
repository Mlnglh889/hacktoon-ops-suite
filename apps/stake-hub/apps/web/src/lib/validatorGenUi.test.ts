import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatorCards } from './validatorGenUi'

test('validator cards use only supplied API fields', () => {
  const view = validatorCards([{
    address: '5ABC',
    nickname: 'Alpha',
    commission_pct: 2.5,
    total_pot: 10,
    own_pot: null,
    nominator_count: 3,
    points: 4,
    era: 59,
    last_seen: 'now',
    data_errors: [],
  }], '11:00')
  assert.equal(view.kind, 'validator_cards')
  assert.equal(view.cards[0].commission, '2.50%')
  assert.equal(view.cards[0].ownStake, '—')
  assert.equal(view.note.includes('not a risk score'), true)
})

test('empty validator input stays an empty state', () => {
  const view = validatorCards([])
  assert.equal(view.kind, 'empty')
  assert.deepEqual(view.cards, [])
})
