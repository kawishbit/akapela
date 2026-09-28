import { describe, expect, test } from 'vitest'
import { otherSeparationModels } from '../../app/utils/separation'
import { SEPARATION_MODEL_NAMES } from '../../server/lib/separators/models'

const CATALOG = SEPARATION_MODEL_NAMES.map(name => ({ name }))

describe('otherSeparationModels', () => {
  test('offers every model but the one that made the current Stems', () => {
    expect(otherSeparationModels(CATALOG, 'Inst_HQ_3').map(m => m.name)).toEqual(['Inst_Main', 'Inst_HQ_4', 'Kim_Vocal_2'])
  })

  test('offers every model when there are no Stems', () => {
    expect(otherSeparationModels(CATALOG, null)).toEqual(CATALOG)
  })
})
