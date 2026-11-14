import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Instive CRM',description:'Daily sales workspace'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
