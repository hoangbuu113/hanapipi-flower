import { forwardRef } from 'react'

const Button = forwardRef(function Button(
  {
    children,
    className = '',
    compact = false,
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  const classes = [
    'button',
    'button--' + variant,
    compact && 'button--compact',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button ref={ref} className={classes} type={type} {...props}>
      {children}
    </button>
  )
})

export default Button
