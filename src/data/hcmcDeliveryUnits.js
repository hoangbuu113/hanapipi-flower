import { hcmcAdministrativeUnits } from './hcmcAdministrativeUnits.js'
import { normalizeSearch } from '../utils/normalizeSearch.js'

export const HCMC_DELIVERY_SCOPE = 'former-ho-chi-minh-city'
export const HCMC_DELIVERY_SCOPE_SOURCE = 'Resolution 1685/NQ-UBTVQH15, items 1-78 and 113-135, plus retained Xã Thạnh An'
export const HCMC_DELIVERY_SCOPE_SOURCE_URL = 'https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-1685-nq-ubtvqh15-sap-xep-cac-dvhc-cap-xa-cua-thanh-pho-ho-chi-minh-nam-2025-119250616211341304.htm'

const deliveryUnitCodes = new Set([
  '26740', '26737', '26743', '26758', '27154', '27139', '27142', '27259', '27265', '27286',
  '27301', '27316', '27343', '27367', '27373', '27364', '27349', '27478', '27484', '27487',
  '27475', '27418', '27427', '27424', '27169', '27190', '27163', '27238', '27232', '27211',
  '27226', '26791', '26785', '26782', '26773', '26767', '27460', '27457', '27442', '27448',
  '27439', '26944', '26929', '26905', '26956', '26911', '26890', '26876', '26884', '26878',
  '26898', '26882', '27043', '27058', '27073', '26977', '26968', '26995', '26983', '27004',
  '27007', '27013', '27019', '27022', '27031', '27028', '26809', '26824', '26803', '26800',
  '26842', '26833', '26857', '26860', '27112', '27097', '26848', '27094', '27601', '27604',
  '27610', '27595', '27637', '27628', '27619', '27667', '27673', '27664', '27553', '27496',
  '27526', '27508', '27511', '27541', '27544', '27568', '27559', '27577', '27592', '27655',
  '27658', '27676',
])

export const hcmcDeliveryUnits = hcmcAdministrativeUnits.filter(({ code }) => deliveryUnitCodes.has(code))

const deliveryUnitsByCode = new Map(hcmcDeliveryUnits.map((unit) => [unit.code, unit]))

export function getHcmcDeliveryUnit(code) {
  return deliveryUnitsByCode.get(String(code ?? '')) ?? null
}

export function searchHcmcDeliveryUnits(query) {
  const term = normalizeSearch(String(query ?? ''))
  return hcmcDeliveryUnits.filter(({ name }) => normalizeSearch(name).includes(term))
}
