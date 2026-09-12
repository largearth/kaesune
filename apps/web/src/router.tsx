import { Route, Routes } from "react-router-dom";
import { RequireSession } from "./components/RequireSession";
import { AllocationPage } from "./pages/AllocationPage";
import { GroupPage } from "./pages/GroupPage";
import { HomePage } from "./pages/HomePage";
import { InvoiceDetailPage } from "./pages/InvoiceDetailPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { LoginPage } from "./pages/LoginPage";
import { MypagePage } from "./pages/MypagePage";
import { RecordsPage } from "./pages/RecordsPage";
import { RecordDetailPage } from "./pages/RecordDetailPage";
import { WalletsPage } from "./pages/WalletsPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/records/:withdrawalId" element={<RecordDetailPage />} />
        <Route
          path="/records/:withdrawalId/claims/new"
          element={<AllocationPage />}
        />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:claimId" element={<InvoiceDetailPage />} />
        <Route path="/mypage" element={<MypagePage />} />
        <Route path="/wallets" element={<WalletsPage />} />
        <Route path="/group" element={<GroupPage />} />
      </Route>
    </Routes>
  );
}
