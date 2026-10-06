import { EmbedOutlet, LudicordActivity } from "ludicord";
import Navbar from "@/components/navbar";
import DiscordOnly from "@/components/discord-only";
import "./globals.css";

export default function Pages() {
  return (
    <LudicordActivity defaultEmbed="home">
      <DiscordOnly>
        <Navbar />
        <EmbedOutlet />
      </DiscordOnly>
    </LudicordActivity>
  );
}
