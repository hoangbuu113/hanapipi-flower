import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import SectionHeading from '../components/SectionHeading'

function RoutePlaceholder({ content, isNotFound = false }) {
  const pageContent = isNotFound
    ? {
        eyebrow: 'Không tìm thấy trang',
        title: 'Trang này chưa kịp nở.',
        description:
          'Nội dung bạn tìm kiếm chưa có sẵn. Hãy tiếp tục khám phá những bó hoa của Hut Flower.',
      }
    : content

  useEffect(() => {
    document.title = pageContent.title + ' — Hut Flower'
  }, [pageContent.title])

  return (
    <main className="route-placeholder">
      <Container>
        <div className="route-placeholder__content">
          <SectionHeading
            as="h1"
            description={pageContent.description}
            eyebrow={pageContent.eyebrow}
            title={pageContent.title}
          />
          <p className="route-placeholder__note">
            Giai đoạn 1 đã hoàn thiện hệ thống hình ảnh, khung ứng dụng và điều hướng.
            Nội dung của trang này sẽ được chăm chút trong giai đoạn tiếp theo.
          </p>
          {isNotFound && (
            <Link className="button button--primary route-placeholder__action" to="/shop">
              Xem cửa hàng
            </Link>
          )}
        </div>
      </Container>
    </main>
  )
}

export default RoutePlaceholder
