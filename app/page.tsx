import { Dashboard } from "@/components/dashboard/dashboard";
import { accounts, trades, cashMovements } from "@/data/demo";
export default function Home() {
  return (
    <Dashboard
      accounts={accounts}
      trades={trades}
      cashMovements={cashMovements}
    />
  );
}
