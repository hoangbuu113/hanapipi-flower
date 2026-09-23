import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSignIn, useSignUp } from '@clerk/clerk-react'
import Container from '../components/Container'
import { useAccount } from '../context/accountStore'
import {
  attemptAuthVerification,
  AUTH_VERIFICATION_FLOWS,
  getActiveVerificationFlow,
  getSignInVerificationFlow,
  getSignUpVerificationFlow,
  getVerificationContent,
} from '../utils/authVerification.js'
import './AccountPages.css'

function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const [form, setForm] = useState({ email: '', name: '', password: '', phone: '' })
  const [code, setCode] = useState('')
  const [verificationFlow, setVerificationFlow] = useState(null)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn()
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp()
  const { user } = useAccount()
  const navigate = useNavigate()

  const isReady = isRegister ? isSignUpLoaded : isSignInLoaded
  const activeVerificationFlow = getActiveVerificationFlow(verificationFlow, mode)
  const verificationContent = getVerificationContent(activeVerificationFlow, form.email)

  useEffect(() => {
    if (user) {
      navigate('/account')
    }
  }, [user, navigate])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '', form: '' }))
  }

  async function handleLogin(event) {
    event.preventDefault()
    const next = {}
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Vui lòng nhập địa chỉ email hợp lệ.'
    if (form.password.length < 6) next.password = 'Mật khẩu cần ít nhất 6 ký tự.'
    if (Object.keys(next).length) {
      setErrors(next)
      return
    }

    if (!isSignInLoaded) {
      setErrors({ form: 'Dịch vụ đăng nhập đang khởi tạo. Vui lòng thử lại.' })
      return
    }

    setIsSubmitting(true)
    try {
      let result = await signIn.create({
        identifier: form.email,
        password: form.password,
      })

      console.log('[SIGNIN_DEBUG_RESULT]', JSON.stringify({
        status: result?.status,
        factors: result?.supportedFirstFactors?.map((f) => f.strategy),
      }))

      if (result.status === 'needs_first_factor') {
        const hasPassword = result.supportedFirstFactors?.some((f) => f.strategy === 'password')
        if (hasPassword) {
          result = await signIn.attemptFirstFactor({
            strategy: 'password',
            password: form.password,
          })
          console.log('[SIGNIN_DEBUG_AFTER_FACTOR]', result?.status)
        }
      }

      const nextVerificationFlow = getSignInVerificationFlow(result)
      if (nextVerificationFlow) {
        await signIn.prepareSecondFactor({ strategy: 'email_code' })
        setVerificationFlow(nextVerificationFlow)
        return
      }

      if (result.status === 'complete') {
        await setSignInActive({ session: result.createdSessionId })
        navigate('/account')
      } else {
        setErrors({ form: 'Đăng nhập chưa hoàn tất. Vui lòng kiểm tra lại thông tin.' })
      }
    } catch (err) {
      const clerkMessage = err.errors?.[0]?.longMessage || err.errors?.[0]?.message
      setErrors({ form: clerkMessage || 'Email hoặc mật khẩu không chính xác.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Vui lòng nhập họ và tên.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Vui lòng nhập địa chỉ email hợp lệ.'
    if (form.phone && !/^(0\d{9}|\+84\d{9})$/.test(form.phone.replace(/\s/g, ''))) {
      next.phone = 'Vui lòng nhập số điện thoại Việt Nam hợp lệ.'
    }
    if (form.password.length < 8) next.password = 'Mật khẩu cần ít nhất 8 ký tự.'
    if (Object.keys(next).length) {
      setErrors(next)
      return
    }

    if (!isSignUpLoaded) {
      setErrors({ form: 'Dịch vụ đăng ký đang khởi tạo. Vui lòng thử lại.' })
      return
    }

    setIsSubmitting(true)
    try {
      const parts = form.name.trim().split(/\s+/)
      const firstName = parts[0] || ''
      const lastName = parts.slice(1).join(' ') || ''

      const result = await signUp.create({
        emailAddress: form.email,
        firstName,
        lastName,
        password: form.password,
      })

      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId })
        navigate('/account')
      } else if (result.status === 'missing_requirements') {
        const nextVerificationFlow = getSignUpVerificationFlow(result)
        if (nextVerificationFlow) {
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
          setVerificationFlow(nextVerificationFlow)
        } else {
          setErrors({ form: 'Đăng ký chưa hoàn tất. Vui lòng kiểm tra lại.' })
        }
      }
    } catch (err) {
      const clerkMessage = err.errors?.[0]?.longMessage || err.errors?.[0]?.message
      setErrors({ form: clerkMessage || 'Không thể tạo tài khoản. Vui lòng thử lại.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault()
    if (!code.trim()) {
      setErrors({ code: 'Vui lòng nhập mã xác thực.' })
      return
    }

    setIsSubmitting(true)
    try {
      const submittedFlow = activeVerificationFlow
      const result = await attemptAuthVerification({
        code: code.trim(),
        signIn,
        signUp,
        verificationFlow: submittedFlow,
      })

      if (result.status === 'complete') {
        const setActive = submittedFlow === AUTH_VERIFICATION_FLOWS.SIGN_UP_EMAIL
          ? setSignUpActive
          : setSignInActive
        await setActive({ session: result.createdSessionId })
        navigate('/account')
      } else {
        setErrors({ form: 'Xác thực chưa hoàn tất. Vui lòng thử lại.' })
      }
    } catch (err) {
      const clerkMessage = err.errors?.[0]?.longMessage || err.errors?.[0]?.message
      setErrors({ code: clerkMessage || 'Mã xác thực không chính xác.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (verificationContent) {
    return (
      <main className="auth-page">
        <Container>
          <div className="auth-panel">
            <p className="eyebrow">Hanapipi Flower của bạn</p>
            <h1>{verificationContent.heading}</h1>
            <p className="auth-panel__intro">
              {verificationContent.intro}
            </p>
            <form noValidate onSubmit={handleVerifyCode}>
              <AuthField error={errors.code} label="Mã xác thực">
                <input
                  autoComplete="one-time-code"
                  disabled={isSubmitting}
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value)
                    setErrors((current) => ({ ...current, code: '', form: '' }))
                  }}
                />
              </AuthField>
              {errors.form && <p className="auth-error" role="alert">{errors.form}</p>}
              <button className="button button--primary" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Đang xử lý...' : verificationContent.buttonLabel}
              </button>
            </form>
          </div>
        </Container>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <Container>
        <div className="auth-panel">
          <p className="eyebrow">Hanapipi Flower của bạn</p>
          <h1>{isRegister ? 'Tạo một tài khoản thật gọn gàng.' : 'Chào mừng bạn trở lại.'}</h1>
          <p className="auth-panel__intro">
            {isRegister
              ? 'Lưu thông tin và xem lại những đơn hoa đã được ghi nhận.'
              : 'Đăng nhập để xem thông tin cá nhân và những đơn hoa của bạn.'}
          </p>
          <form noValidate onSubmit={isRegister ? handleRegister : handleLogin}>
            {isRegister && (
              <AuthField error={errors.name} label="Họ và tên">
                <input
                  autoComplete="name"
                  disabled={isSubmitting}
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                />
              </AuthField>
            )}
            <AuthField error={errors.email} label="Email">
              <input
                autoComplete="email"
                disabled={isSubmitting}
                type="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
              />
            </AuthField>
            {isRegister && (
              <AuthField error={errors.phone} label="Số điện thoại">
                <input
                  autoComplete="tel"
                  disabled={isSubmitting}
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => update('phone', event.target.value)}
                />
              </AuthField>
            )}
            <AuthField error={errors.password} label="Mật khẩu">
              <input
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                disabled={isSubmitting}
                type="password"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
              />
            </AuthField>
            {errors.form && <p className="auth-error" role="alert">{errors.form}</p>}
            <button className="button button--primary" disabled={isSubmitting || !isReady} type="submit">
              {isSubmitting ? 'Đang xử lý...' : !isReady ? 'Đang tải...' : (isRegister ? 'Tạo tài khoản' : 'Đăng nhập')}
            </button>
          </form>
          <p className="auth-switch">
            {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
            <Link to={isRegister ? '/login' : '/register'}>
              {isRegister ? 'Đăng nhập' : 'Đăng ký'}
            </Link>
          </p>
        </div>
      </Container>
    </main>
  )
}

function AuthField({ children, error, label }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      {children}
      {error && <em>{error}</em>}
    </label>
  )
}

export default AuthPage
