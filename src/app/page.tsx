import Link from "next/link";
import { ResumeBox } from "@/screens/ResumeBox";

export default function Home() {
  return (
    <div className="page home">
      <h1>Trouvez de vrais clients avec des agents IA.</h1>
      <p className="lead">Envoyez vos agents sur la carte, gardez les meilleurs prospects dans votre carnet.</p>
      <p>
        <Link className="btn btn-primary" href="/creer">
          Nouvelle partie
        </Link>
      </p>
      <ResumeBox />
    </div>
  );
}
