import { SettingsForm } from "@/components/settings/settings-form";
import { getPreferences } from "@/lib/preferences";
import { requirePageOwner } from "@/lib/session";
export const metadata = { title: "Settings" };
export default async function Page() {
  await requirePageOwner();
  return <SettingsForm preferences={await getPreferences()} />;
}
