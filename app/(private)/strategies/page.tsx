import {requirePageUser} from "@/lib/session";
import {StrategyIndex} from "@/components/strategies/index";
export const metadata={title:"Strategies"};
export default async function Page(){await requirePageUser();return <StrategyIndex/>;}
