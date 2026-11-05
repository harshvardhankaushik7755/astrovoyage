import { useGame } from "./store/gameStore";
import { Home } from "./screens/Home";
import { TeamSetup } from "./screens/TeamSetup";
import { ChooseMission } from "./screens/ChooseMission";
import { MissionPlan } from "./screens/MissionPlan";
import { DesignLab } from "./screens/DesignLab";
import { Launch } from "./screens/Launch";
import { MissionControl } from "./screens/MissionControl";
import { Result } from "./screens/Result";
import { UiSounds } from "./components/UiSounds";

export default function App() {
  const screen = useGame((s) => s.screen);
  return (
    <main className={"app" + (screen === "mission" ? " app-cockpit" : "")}>
      <UiSounds />
      {screen === "home" && <Home />}
      {screen === "team" && <TeamSetup />}
      {screen === "choose" && <ChooseMission />}
      {screen === "plan" && <MissionPlan />}
      {screen === "design" && <DesignLab />}
      {screen === "launch" && <Launch />}
      {screen === "mission" && <MissionControl />}
      {screen === "result" && <Result />}
    </main>
  );
}
