export const AUTH_VERIFICATION_FLOWS = Object.freeze({
  SIGN_IN_SECOND_FACTOR: 'sign_in_second_factor',
  SIGN_UP_EMAIL: 'sign_up_email',
})

export function getSignInVerificationFlow(result) {
  if (result?.status !== 'needs_second_factor') return null

  const supportsEmailCode = result.supportedSecondFactors
    ?.some((factor) => factor.strategy === 'email_code')

  return supportsEmailCode
    ? AUTH_VERIFICATION_FLOWS.SIGN_IN_SECOND_FACTOR
    : null
}

export function getSignUpVerificationFlow(result) {
  const needsEmailVerification = result?.status === 'missing_requirements'
    && result.unverifiedFields?.includes('email_address')

  return needsEmailVerification
    ? AUTH_VERIFICATION_FLOWS.SIGN_UP_EMAIL
    : null
}

export function getActiveVerificationFlow(verificationFlow, mode) {
  if (mode === 'login' && verificationFlow === AUTH_VERIFICATION_FLOWS.SIGN_IN_SECOND_FACTOR) {
    return verificationFlow
  }

  if (mode === 'register' && verificationFlow === AUTH_VERIFICATION_FLOWS.SIGN_UP_EMAIL) {
    return verificationFlow
  }

  return null
}

export function getVerificationContent(verificationFlow, email) {
  if (verificationFlow === AUTH_VERIFICATION_FLOWS.SIGN_IN_SECOND_FACTOR) {
    return {
      buttonLabel: 'Xác thực đăng nhập',
      heading: 'Xác thực đăng nhập',
      intro: `Mã xác thực đã được gửi đến địa chỉ email ${email}. Vui lòng nhập mã để xác thực lần đăng nhập này.`,
    }
  }

  if (verificationFlow === AUTH_VERIFICATION_FLOWS.SIGN_UP_EMAIL) {
    return {
      buttonLabel: 'Xác thực tài khoản',
      heading: 'Xác thực email',
      intro: `Mã xác thực đã được gửi đến địa chỉ email ${email}. Vui lòng nhập mã để hoàn tất tạo tài khoản.`,
    }
  }

  return null
}

export async function attemptAuthVerification({ code, signIn, signUp, verificationFlow }) {
  if (verificationFlow === AUTH_VERIFICATION_FLOWS.SIGN_IN_SECOND_FACTOR) {
    return signIn.attemptSecondFactor({ strategy: 'email_code', code })
  }

  if (verificationFlow === AUTH_VERIFICATION_FLOWS.SIGN_UP_EMAIL) {
    return signUp.attemptEmailAddressVerification({ code })
  }

  throw new TypeError('A valid auth verification flow is required.')
}
