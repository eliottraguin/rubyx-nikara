import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResumeBox } from "@/screens/ResumeBox";

const apiUrl = (process.env.RUBIX_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

/** Garde d'authentification : redirige vers /login sans session valide (cookie absent ou refusé par l'API). */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) redirect("/login");
  let status: number;
  try {
    const res = await fetch(`${apiUrl}/api/auth/me`, { headers: { cookie: `auth_token=${token}` }, cache: "no-store" });
    status = res.status;
  } catch {
    return; // API injoignable : on ne bloque pas l'accueil, les écrans gèrent l'erreur.
  }
  if (status === 401) redirect("/login");
}

export default async function Home() {
  await requireSession();
  return (
    <div className="page home">
      <h1>Trouvez de vrais clients avec des agents IA.</h1>
      <p className="lead">Envoyez vos agents sur la carte, gardez les meilleurs prospects dans votre carnet.</p>
      <p>
        <Link className="btn btn-primary" href="/creer">
          Nouvelle partie
        </Link>{" "}
        <Link className="btn" href="/login">
          Se connecter
        </Link>
      </p>
      <ResumeBox />
    </div>
  );
}
