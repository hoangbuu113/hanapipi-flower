import { HCMC_CITY } from '../data/hcmcAdministrativeUnits.js'

export function getCheckoutSavedAddressFields(savedAddress) {
  return {
    address: savedAddress.detail || savedAddress.address?.detail || '',
    city: savedAddress.city || savedAddress.address?.city || HCMC_CITY,
    deliveryNote: savedAddress.deliveryNote || savedAddress.address?.deliveryNote || '',
    district: savedAddress.district || savedAddress.address?.district || '',
    receiverIsBuyer: false,
    receiverName: savedAddress.recipientName || savedAddress.recipient?.name || '',
    receiverPhone: savedAddress.recipientPhone || savedAddress.recipient?.phone || '',
    unitCode: savedAddress.unitCode || savedAddress.address?.unitCode || '',
    ward: savedAddress.ward || savedAddress.address?.ward || '',
  }
}
