import { ArrowRight, MessageCircle, Send, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchShopCatalogue } from '../services/catalogueClient'
import { getConciergeReply } from '../services/conciergeService'
import { getGroundedCandidates } from '../utils/conciergeGrounding'
import { OPEN_CONCIERGE_EVENT } from '../utils/conciergeEvents'
import { trapDialogFocus } from '../utils/focus'
import { getProductPriceLabel } from '../utils/productCommerce'
import './ConciergeWidget.css'

const MAX_MESSAGES = 8
const QUICK_PROMPTS = [
  'Chọn hoa theo dịp',
  'Cách chăm hoa',
  'Giao hoa trong ngày',
  'Quà tặng và lời nhắn',
]
const OPENING_MESSAGE = {
  id: 'opening',
  localOnly: true,
  role: 'assistant',
  source: 'local',
  text: 'Chào bạn, mình có thể giúp chọn hoa, hướng dẫn chăm hoa hoặc giải đáp về giao tặng. Bạn đang cần điều gì?',
}

function keepRecentMessages(messages) {
  return messages.slice(-MAX_MESSAGES)
}

function getPageContext(pathname, catalogue = []) {
  const match = pathname.match(/^\/product\/([^/]+)$/)
  const slug = match ? decodeURIComponent(match[1]) : null
  const product = slug ? (catalogue.find((item) => item.slug === slug || item.id === slug) ?? null) : null
  return {
    currentProduct: product,
    pageContext: {
      productId: product?.id ?? null,
      route: pathname,
    },
  }
}

function ConciergeProductLink({ product, onNavigate }) {
  const image = product.images[0]
  return (
    <Link className="concierge-product-link" to={`/product/${product.slug}`} onClick={onNavigate}>
      <img
        alt={image.alt}
        loading="lazy"
        src={image.src}
        style={{ objectFit: image.fit ?? 'cover', objectPosition: image.position }}
      />
      <span>
        <strong>{product.name}</strong>
        <small>{getProductPriceLabel(product)}</small>
      </span>
      <ArrowRight aria-hidden="true" />
    </Link>
  )
}

function ConciergeLink({ link, onNavigate }) {
  const content = <>{link.label}<ArrowRight aria-hidden="true" /></>
  if (link.external) {
    return (
      <a href={link.to} rel="noopener noreferrer" target="_blank" onClick={onNavigate}>
        {content}
      </a>
    )
  }
  return <Link to={link.to} onClick={onNavigate}>{content}</Link>
}

function ConciergeMessage({ message, onNavigate, onQuickReply }) {
  const isUser = message.role === 'user'
  const sourceLabel = message.source === 'ai' ? 'Hut Flower AI' : 'Hướng dẫn từ Hut Flower'
  return (
    <article className={`concierge-message concierge-message--${message.role}`}>
      <p className="concierge-message__label">{isUser ? 'Bạn' : sourceLabel}</p>
      <p className="concierge-message__text">{message.text}</p>
      {message.notice && <p className="concierge-message__notice">{message.notice}</p>}
      {message.products?.length > 0 && (
        <div className="concierge-message__products" aria-label="Sản phẩm được gợi ý">
          {message.products.map((product) => (
            <ConciergeProductLink key={product.id} product={product} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      {message.links?.length > 0 && (
        <div className="concierge-message__links" aria-label="Liên kết được gợi ý">
          {message.links.map((link) => (
            <ConciergeLink key={link.id} link={link} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      {message.note && <p className="concierge-message__note">{message.note}</p>}
      {message.quickReplies?.length > 0 && (
        <div className="concierge-quick-replies" aria-label="Câu trả lời nhanh">
          {message.quickReplies.map((reply) => (
            <button key={reply} type="button" onClick={() => onQuickReply(reply)}>{reply}</button>
          ))}
        </div>
      )}
    </article>
  )
}

function ConciergeWidget() {
  const location = useLocation()
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 719px)').matches)
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([OPENING_MESSAGE])
  const messageIdRef = useRef(0)
  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const previousFocusRef = useRef(null)
  const triggerRef = useRef(null)
  const wasOpenRef = useRef(false)
  const catalogueReadyRef = useRef(false)
  const [catalogue, setCatalogue] = useState([])
  const pageData = useMemo(() => getPageContext(location.pathname, catalogue), [location.pathname, catalogue])
  const hasConversation = messages.some(({ role }) => role === 'user')

  function nextMessageId(prefix) {
    messageIdRef.current += 1
    return `${prefix}-${messageIdRef.current}`
  }

  function openPanel(returnFocus) {
    previousFocusRef.current = returnFocus?.isConnected
      ? returnFocus
      : (document.activeElement !== document.body ? document.activeElement : triggerRef.current)
    setIsOpen(true)
  }

  function closePanel() {
    setIsOpen(false)
  }

  async function sendMessage(value) {
    const trimmedMessage = value.trim()
    if (!trimmedMessage || isLoading) {
      if (!trimmedMessage) {
        setInputError('Hãy nhập điều bạn muốn Hut Flower hỗ trợ.')
        inputRef.current?.focus()
      }
      return
    }

    let activeCatalogue = catalogue
    try {
      if (!catalogueReadyRef.current) {
        const result = await fetchShopCatalogue()
        if (result.ok && Array.isArray(result.data)) {
          catalogueReadyRef.current = true
          activeCatalogue = result.data
          setCatalogue(result.data)
        }
      }
    } catch {
      // Preserve the most recent useful catalogue if refresh fails.
    }

    const currentProduct = pageData.currentProduct ?? (
      location.pathname.match(/^\/product\/([^/]+)$/)
        ? (activeCatalogue.find((item) => item.slug === decodeURIComponent(location.pathname.match(/^\/product\/([^/]+)$/)[1]) || item.id === decodeURIComponent(location.pathname.match(/^\/product\/([^/]+)$/)[1])) ?? null)
        : null
    )
    const pageContext = {
      productId: currentProduct?.id ?? null,
      route: location.pathname,
    }

    const userMessage = {
      id: nextMessageId('user'),
      role: 'user',
      text: trimmedMessage,
    }
    const requestHistory = messages
      .filter(({ localOnly }) => !localOnly)
      .map(({ role, text }) => ({ content: text, role }))
    const recentUserContext = messages
      .filter((item) => item.role === 'user')
      .slice(-3)
      .map((item) => item.text)
      .concat(trimmedMessage)
      .join(' ')
    const grounding = getGroundedCandidates(recentUserContext, activeCatalogue)

    setMessages((current) => keepRecentMessages([...current, userMessage]))
    setInput('')
    setInputError('')
    setIsLoading(true)

    const response = await getConciergeReply({
      catalogue: activeCatalogue,
      currentProduct,
      grounding,
      history: requestHistory,
      message: trimmedMessage,
      pageContext,
    })

    const assistantMessage = {
      id: nextMessageId('assistant'),
      links: response.links,
      notice: response.notice,
      note: response.note,
      products: response.products,
      quickReplies: response.quickReplies,
      role: 'assistant',
      source: response.source,
      text: response.message,
    }
    setMessages((current) => keepRecentMessages([...current, assistantMessage]))
    setIsLoading(false)
  }

  function handleSubmit(event) {
    event.preventDefault()
    void sendMessage(input)
  }

  function clearConversation() {
    setMessages([OPENING_MESSAGE])
    setInput('')
    setInputError('')
    inputRef.current?.focus()
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 719px)')
    const updateViewport = () => setIsMobile(mediaQuery.matches)
    mediaQuery.addEventListener('change', updateViewport)
    return () => mediaQuery.removeEventListener('change', updateViewport)
  }, [])

  useEffect(() => {
    const handleOpenRequest = (event) => openPanel(event.detail?.returnFocus)
    window.addEventListener(OPEN_CONCIERGE_EVENT, handleOpenRequest)
    return () => window.removeEventListener(OPEN_CONCIERGE_EVENT, handleOpenRequest)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus())
    const handleKeydown = (event) => {
      if (event.key === 'Escape') closePanel()
      else if (isMobile) trapDialogFocus(event, panelRef.current)
    }
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [isMobile, isOpen])

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true
      return undefined
    }
    if (!wasOpenRef.current) return undefined

    wasOpenRef.current = false
    const focusFrame = window.requestAnimationFrame(() => {
      const focusTarget = previousFocusRef.current?.isConnected
        ? previousFocusRef.current
        : triggerRef.current
      focusTarget?.focus()
    })
    return () => window.cancelAnimationFrame(focusFrame)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !isMobile) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isMobile, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const scrollFrame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' })
    })
    return () => window.cancelAnimationFrame(scrollFrame)
  }, [isLoading, isOpen, messages])

  if (location.pathname === '/font-diagnostic') return null

  const needsRaisedTrigger = location.pathname === '/build-your-bouquet'

  return (
    <div className={`concierge-widget${needsRaisedTrigger ? ' concierge-widget--raised' : ''}`}>
      <button
        aria-controls="hanapipi-concierge-panel"
        aria-expanded={isOpen}
        aria-label="Mở Hut Flower tư vấn"
        className={`concierge-trigger${isOpen ? ' is-hidden' : ''}`}
        ref={triggerRef}
        tabIndex={isOpen ? -1 : 0}
        type="button"
        onClick={() => openPanel(triggerRef.current)}
      >
        <MessageCircle aria-hidden="true" />
        <span>Tư vấn</span>
      </button>

      {isOpen && isMobile && (
        <button
          aria-label="Đóng Hut Flower tư vấn"
          className="concierge-backdrop"
          type="button"
          onClick={closePanel}
        />
      )}

      {isOpen && (
        <section
          aria-labelledby="hanapipi-concierge-title"
          aria-modal={isMobile ? 'true' : undefined}
          className="concierge-dialog"
          id="hanapipi-concierge-panel"
          ref={panelRef}
          role="dialog"
        >
          <header className="concierge-dialog__header">
            <div>
              <h2 id="hanapipi-concierge-title">Hut Flower tư vấn</h2>
              <p>Chọn hoa và giải đáp cùng bạn.</p>
            </div>
            <button aria-label="Đóng Hut Flower tư vấn" type="button" onClick={closePanel}>
              <X aria-hidden="true" />
            </button>
          </header>

          <div
            aria-live="polite"
            aria-relevant="additions text"
            className="concierge-dialog__messages"
            role="log"
          >
            {messages.map((message) => (
              <ConciergeMessage
                key={message.id}
                message={message}
                onNavigate={closePanel}
                onQuickReply={(reply) => void sendMessage(reply)}
              />
            ))}
            {!hasConversation && (
              <div className="concierge-quick-prompts" aria-label="Gợi ý câu hỏi">
                {QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => void sendMessage(prompt)}>{prompt}</button>
                ))}
              </div>
            )}
            {isLoading && (
              <p className="concierge-loading-message" role="status">
                Hut Flower đang tìm lời phù hợp…
              </p>
            )}
            <span ref={messagesEndRef} />
          </div>

          <footer className="concierge-dialog__footer">
            <div className="concierge-dialog__tools">
              <span>Không chia sẻ thông tin giao nhận trong chat.</span>
              <button disabled={isLoading} type="button" onClick={clearConversation}>
                <Trash2 aria-hidden="true" /> Xóa cuộc trò chuyện
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <label htmlFor="hanapipi-concierge-input">Tin nhắn</label>
              <div>
                <textarea
                  aria-describedby={inputError ? 'hanapipi-concierge-error' : undefined}
                  aria-invalid={Boolean(inputError)}
                  id="hanapipi-concierge-input"
                  maxLength={500}
                  placeholder="Bạn muốn hỏi điều gì?"
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value)
                    if (inputError) setInputError('')
                  }}
                />
                <button aria-label="Gửi tin nhắn" disabled={isLoading || !input.trim()} type="submit">
                  <Send aria-hidden="true" />
                </button>
              </div>
              <span>{input.length}/500</span>
              {inputError && <p id="hanapipi-concierge-error" role="alert">{inputError}</p>}
            </form>
          </footer>
        </section>
      )}
    </div>
  )
}

export default ConciergeWidget
