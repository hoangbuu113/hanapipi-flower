import Container from '../components/Container'
import './TypographyTest.css'

const candidates = [
  {
    fontFamily: '"DM Serif Display", Georgia, serif',
    name: 'DM Serif Display',
    note: 'Đối chứng hiện tại',
  },
  {
    fontFamily: '"Playfair Display", Georgia, serif',
    name: 'Playfair Display',
    note: 'Đã xác nhận hỗ trợ tiếng Việt',
  },
  {
    fontFamily: '"Cormorant Garamond", Georgia, serif',
    name: 'Cormorant Garamond',
    note: 'Đã xác nhận hỗ trợ tiếng Việt',
  },
  {
    fontFamily: '"Noto Serif Display", Georgia, serif',
    name: 'Noto Serif Display',
    note: 'Đã xác nhận hỗ trợ tiếng Việt',
  },
  {
    fontFamily: '"Spectral", Georgia, serif',
    name: 'Spectral',
    note: 'Đã xác nhận hỗ trợ tiếng Việt',
  },
]

const testSentences = [
  'Mọi điều bạn cần, thật gọn gàng.',
  'Gửi hoa, gửi cả điều khó nói.',
  'Những bó hoa được yêu thích',
  'Một bó hoa nhỏ cho ngày thật đặc biệt',
  'Người nhận và địa chỉ giao hoa',
  'Yêu thương đôi khi chỉ cần một bó hoa.',
]

function TypographyTest() {
  return (
    <main className="type-test">
      <Container>
        <header className="type-test__intro">
          <p className="eyebrow">Chỉ dùng để so sánh trong quá trình phát triển</p>
          <h1>So sánh serif hiển thị tiếng Việt</h1>
          <p>
            Manrope vẫn là phông chữ cho toàn bộ nội dung và giao diện. Các mẫu dưới đây
            dùng cùng kích thước, chiều rộng và chiều cao dòng để bạn đánh giá riêng từng
            serif hiển thị.
          </p>
        </header>

        <div className="type-test__candidates">
          {candidates.map((candidate) => (
            <article
              className="type-test__candidate"
              key={candidate.name}
              style={{ '--type-test-font': candidate.fontFamily }}
            >
              <header className="type-test__candidate-header">
                <div>
                  <p className="type-test__name">{candidate.name}</p>
                  <p className="type-test__note">{candidate.note}</p>
                </div>
                <span className="type-test__weight">400 · Normal</span>
              </header>

              <div className="type-test__sentences">
                {testSentences.map((sentence) => (
                  <p className="type-test__sentence" key={sentence}>
                    {sentence}
                  </p>
                ))}
              </div>

              <div className="type-test__checks">
                <div className="type-test__check type-test__check--48">
                  <span>48 px · tracking thường</span>
                  <p>Mọi điều bạn cần, thật gọn gàng.</p>
                </div>
                <div className="type-test__check type-test__check--64">
                  <span>64 px · tracking thường</span>
                  <p>Gửi hoa, gửi cả điều khó nói.</p>
                </div>
                <div className="type-test__check type-test__check--80">
                  <span>80 px · tracking thường</span>
                  <p>Những bó hoa được yêu thích</p>
                </div>
                <div className="type-test__check type-test__check--tight">
                  <span>64 px · tracking -0,02 em</span>
                  <p>Một bó hoa nhỏ cho ngày thật đặc biệt</p>
                </div>
              </div>

              <div className="type-test__casing">
                <div>
                  <span>Chữ thường</span>
                  <p>Người nhận và địa chỉ giao hoa</p>
                </div>
                <div className="type-test__uppercase">
                  <span>Chữ hoa</span>
                  <p>Yêu thương đôi khi chỉ cần một bó hoa.</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </main>
  )
}

export default TypographyTest
