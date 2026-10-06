import { SettingsForm } from "@/components/settings/settings-form";
import { getPreferences } from "@/lib/preferences";
import { requirePageUser } from "@/lib/session";
export const metadata = { title: "Settings" };
export default async function Page() {
  await requirePageUser();
  return <SettingsForm preferences={await getPreferences()} />;
}
