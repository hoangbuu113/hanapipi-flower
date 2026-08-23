import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Container from '../components/Container'
import { useAccount } from '../context/accountStore'
import './AccountPages.css'

function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const [form, setForm] = useState({ email: '', name: '', password: '', phone: '' })
  const [errors, setErrors] = useState({})
  const { login, register } = useAccount()
  const navigate = useNavigate()
  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })) }
  function submit(event) {
    event.preventDefault()
    const next = {}
    if (isRegister && !form.name.trim()) next.name = 'Vui lòng nhập họ và tên.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Vui lòng nhập địa chỉ email hợp lệ.'
    if (isRegister && !/^(0\d{9}|\+84\d{9})$/.test(form.phone.replace(/\s/g, ''))) next.phone = 'Vui lòng nhập số điện thoại Việt Nam hợp lệ.'
    if (form.password.length < 6) next.password = 'Mật khẩu demo cần ít nhất 6 ký tự.'
    if (Object.keys(next).length) { setErrors(next); return }
    if (isRegister) register(form)
    else if (!login(form)) { setErrors({ form: 'Email hoặc mật khẩu chưa đúng với tài khoản demo.' }); return }
    navigate('/account')
  }
  return <main className="auth-page"><Container><div className="auth-panel"><p className="eyebrow">Hanapipi Flower của bạn</p><h1>{isRegister ? 'Tạo một tài khoản thật gọn gàng.' : 'Chào mừng bạn trở lại.'}</h1><p className="auth-panel__intro">{isRegister ? 'Lưu thông tin và xem lại những đơn hoa đã được ghi nhận.' : 'Đăng nhập để xem thông tin cá nhân và những đơn hoa của bạn.'}</p><form noValidate onSubmit={submit}>{isRegister && <AuthField error={errors.name} label="Họ và tên"><input autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} /></AuthField>}<AuthField error={errors.email} label="Email"><input autoComplete="email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></AuthField>{isRegister && <AuthField error={errors.phone} label="Số điện thoại"><input autoComplete="tel" inputMode="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} /></AuthField>}<AuthField error={errors.password} label="Mật khẩu"><input autoComplete={isRegister ? 'new-password' : 'current-password'} type="password" value={form.password} onChange={(event) => update('password', event.target.value)} /></AuthField>{errors.form && <p className="auth-error" role="alert">{errors.form}</p>}<button className="button button--primary" type="submit">{isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}</button></form><p className="auth-switch">{isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Đăng nhập' : 'Đăng ký'}</Link></p><p className="auth-demo">Đây là tài khoản demo được lưu trên trình duyệt hiện tại.</p></div></Container></main>
}
function AuthField({ children, error, label }) { return <label className="auth-field"><span>{label}</span>{children}{error && <em>{error}</em>}</label> }
export default AuthPage
