import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import SiteLayout from './layouts/SiteLayout'
import HomePage from './pages/HomePage'
import ProductDetailPage from './pages/ProductDetailPage'
import RoutePlaceholder from './pages/RoutePlaceholder'
import ShopPage from './pages/ShopPage'
import SearchPage from './pages/SearchPage'
import WishlistPage from './pages/WishlistPage'
import CartPage from './pages/CartPage'
import BuildBouquetPage from './pages/BuildBouquetPage'
import FlowerFinderPage from './pages/FlowerFinderPage'
import CheckoutPage from './pages/CheckoutPage'
import CheckoutSuccessPage from './pages/CheckoutSuccessPage'
import AuthPage from './pages/AuthPage'
import AccountPage from './pages/AccountPage'
import DeliveryInformationPage from './pages/DeliveryInformationPage'
import FlowerCarePage from './pages/FlowerCarePage'
import FlowerAlreadyTakenPage from './pages/FlowerAlreadyTakenPage'

const TypographyTest = lazy(() => import('./pages/TypographyTest'))

const routeContent = {
  home: {
    eyebrow: 'Hanapipi Flower',
    title: 'Một trải nghiệm hoa đầy cảm xúc đang dần thành hình.',
    description:
      'Cửa hàng hoa trực tuyến của chúng tôi đang được vun đắp với sự chăm chút dành cho từng bó hoa. Bộ sưu tập sẽ sớm ra mắt.',
  },
  shop: {
    eyebrow: 'Bộ sưu tập',
    title: 'Bộ sưu tập đang được hoàn thiện.',
    description:
      'Những bó hoa tuyển chọn, tính năng tìm kiếm và bộ lọc sẽ được giới thiệu trong giai đoạn tiếp theo.',
  },
  product: {
    eyebrow: 'Thông tin bó hoa',
    title: 'Mỗi bó hoa đều có một câu chuyện riêng.',
    description:
      'Hình ảnh, lựa chọn kích thước và thông tin giao hoa sẽ được hoàn thiện trong giai đoạn tiếp theo.',
  },
  bouquet: {
    eyebrow: 'Một món quà của riêng bạn',
    title: 'Tự tay phối một bó hoa thật riêng.',
    description:
      'Hành trình phối hoa sáu bước đang được chuẩn bị cho giai đoạn tiếp theo.',
  },
  finder: {
    eyebrow: 'Gợi ý tinh tế',
    title: 'Tìm bó hoa thật vừa vặn với dịp của bạn.',
    description:
      'Trải nghiệm gợi ý ngắn gọn sẽ giúp bạn chọn được bó hoa phù hợp trong giai đoạn tiếp theo.',
  },
  cart: {
    eyebrow: 'Lựa chọn của bạn',
    title: 'Giỏ hoa đang được chuẩn bị.',
    description:
      'Giỏ hàng và thông tin giao hoa sẽ được hoàn thiện cùng trải nghiệm mua sắm.',
  },
  checkout: {
    eyebrow: 'Gửi trọn yêu thương',
    title: 'Một hành trình giao hoa thật chu đáo.',
    description:
      'Thông tin giao nhận và lời nhắn tặng sẽ được hoàn thiện khi thanh toán ra mắt.',
  },
  confirmation: {
    eyebrow: 'Xác nhận đơn hoa',
    title: 'Cảm ơn bạn đã chọn Hanapipi Flower.',
    description:
      'Trải nghiệm xác nhận đơn sẽ được hoàn thiện cùng quy trình thanh toán.',
  },
  wishlist: {
    eyebrow: 'Đã lưu cho dịp đặc biệt',
    title: 'Những bó hoa bạn yêu thích.',
    description:
      'Danh sách hoa đã lưu sẽ sớm có mặt trong giai đoạn tiếp theo.',
  },
  search: {
    eyebrow: 'Khám phá hoa',
    title: 'Tìm đúng bó hoa bạn đang nghĩ đến.',
    description:
      'Tính năng tìm kiếm theo nhu cầu sẽ được thêm vào cùng trải nghiệm mua hoa.',
  },
  login: {
    eyebrow: 'Chào mừng bạn trở lại',
    title: 'Không gian riêng của bạn đang được chuẩn bị.',
    description:
      'Trải nghiệm đăng nhập đơn giản sẽ được hoàn thiện trong giai đoạn tiếp theo.',
  },
  account: {
    eyebrow: 'Hanapipi Flower của bạn',
    title: 'Mọi điều bạn cần, thật gọn gàng.',
    description:
      'Địa chỉ đã lưu, đơn hàng và nhắc nhở tặng hoa sẽ có mặt trong giai đoạn tiếp theo.',
  },
  orders: {
    eyebrow: 'Đơn hoa của bạn',
    title: 'Hành trình của những bó hoa đã gửi.',
    description:
      'Lịch sử đơn hàng mẫu sẽ được thêm vào cùng trải nghiệm tài khoản.',
  },
}

function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="shop" element={<ShopPage />} />
        <Route path="product/:slug" element={<ProductDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="wishlist" element={<WishlistPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="build-your-bouquet" element={<BuildBouquetPage />} />
        <Route path="flower-finder" element={<FlowerFinderPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="checkout/success/:orderCode" element={<CheckoutSuccessPage />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="delivery-information" element={<DeliveryInformationPage />} />
        <Route path="flower-care" element={<FlowerCarePage />} />
        <Route path="flower-already-taken" element={<FlowerAlreadyTakenPage />} />
        <Route
          path="account/orders"
          element={<RoutePlaceholder content={routeContent.orders} />}
        />
        <Route path="font-diagnostic" element={<Suspense fallback={null}><TypographyTest /></Suspense>} />
        <Route path="*" element={<RoutePlaceholder isNotFound />} />
      </Route>
    </Routes>
  )
}

export default App
