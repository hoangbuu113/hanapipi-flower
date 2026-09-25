import { HCMC_CITY, getHcmcAdministrativeUnit } from '../data/hcmcAdministrativeUnits.js'
import { getHcmcDeliveryUnit } from '../data/hcmcDeliveryUnits.js'

export { getHcmcDeliveryUnit }

export function validateHcmcDeliveryAddress(address) {
  const errors = {}
  if (address?.city !== HCMC_CITY) errors.city = 'Hanapipi hiện chỉ giao hoa tại TP. Hồ Chí Minh.'
  const administrativeUnit = getHcmcAdministrativeUnit(address?.unitCode)
  const unit = getHcmcDeliveryUnit(address?.unitCode)
  let rejectionCode = null
  if (!administrativeUnit) {
    errors.unitCode = 'Vui lòng chọn phường hoặc xã hiện hành tại TP. Hồ Chí Minh.'
    rejectionCode = 'INVALID_ADMIN_UNIT'
  } else if (!unit) {
    errors.unitCode = 'Hanapipi hiện chưa giao hoa tại khu vực này.'
    rejectionCode = 'NOT_SERVICEABLE'
  }
  if (unit && address?.ward != null && address.ward !== '' && address.ward !== unit.name) {
    errors.ward = 'Tên đơn vị hành chính không khớp với mã đã chọn.'
  }
  if (typeof address?.detail !== 'string' || !address.detail.trim() || address.detail.trim().length > 240) {
    errors.detail = 'Vui lòng nhập số nhà, tên đường hoặc địa chỉ giao hoa cụ thể (tối đa 240 ký tự).'
  }
  return { administrativeUnit, errors, rejectionCode, unit }
}
