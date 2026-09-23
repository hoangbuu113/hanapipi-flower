/**
 * VietQR / EMVCo QR Code Payload Generator
 *
 * Implements the official NAPAS VietQR specification (EMVCo standard)
 * for 247 interbank fund transfers to bank accounts.
 */

export function formatTlv(tag, value) {
  const stringValue = String(value ?? '')
  const length = String(stringValue.length).padStart(2, '0')
  return `${tag}${length}${stringValue}`
}

export function crc16Ccitt(payload) {
  let crc = 0xFFFF
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) << 8)
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF
      } else {
        crc = (crc << 1) & 0xFFFF
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function generateVietQrPayload({
  accountNumber,
  amountVnd,
  bankBin,
  transferContent,
}) {
  if (!bankBin || typeof bankBin !== 'string' || !/^\d{6}$/u.test(bankBin)) {
    throw new TypeError('A valid 6-digit bank BIN is required for VietQR.')
  }
  if (!accountNumber || typeof accountNumber !== 'string' || accountNumber.length < 1 || accountNumber.length > 34) {
    throw new TypeError('A valid bank account number is required for VietQR.')
  }
  if (!Number.isInteger(amountVnd) || amountVnd < 0) {
    throw new TypeError('A non-negative integer amount in VND is required for VietQR.')
  }

  const cleanTransferContent = typeof transferContent === 'string'
    ? transferContent.trim().slice(0, 50)
    : ''

  // Tag 00: Payload Format Indicator (01)
  const tag00 = formatTlv('00', '01')

  // Tag 01: Point of Initiation Method (12 = dynamic, transaction amount included)
  const tag01 = formatTlv('01', '12')

  // Tag 38: Consumer Account Information (NAPAS 247 interbank transfer)
  // Sub-tag 00: GUID (A000000727)
  const subTag00 = formatTlv('00', 'A000000727')
  // Sub-tag 01: Beneficiary organization (sub-sub-tag 00: BIN, sub-sub-tag 01: Account Number)
  const beneficiaryInfo = formatTlv('00', bankBin) + formatTlv('01', accountNumber)
  const subTag01 = formatTlv('01', beneficiaryInfo)
  // Sub-tag 02: Service Code (QRIBFTTA = Quick Response Interbank Fast Transfer To Account)
  const subTag02 = formatTlv('02', 'QRIBFTTA')
  const tag38 = formatTlv('38', `${subTag00}${subTag01}${subTag02}`)

  // Tag 53: Transaction Currency (704 = VND)
  const tag53 = formatTlv('53', '704')

  // Tag 54: Transaction Amount
  const tag54 = formatTlv('54', String(amountVnd))

  // Tag 58: Country Code (VN)
  const tag58 = formatTlv('58', 'VN')

  // Tag 62: Additional Data Field (Sub-tag 08: Purpose of transaction / reference)
  let tag62 = ''
  if (cleanTransferContent) {
    const subTag08 = formatTlv('08', cleanTransferContent)
    tag62 = formatTlv('62', subTag08)
  }

  // Tag 63: CRC16-CCITT checksum over the raw payload up to and including '6304'
  const rawWithoutCrc = `${tag00}${tag01}${tag38}${tag53}${tag54}${tag58}${tag62}6304`
  const crc = crc16Ccitt(rawWithoutCrc)

  return `${rawWithoutCrc}${crc}`
}
