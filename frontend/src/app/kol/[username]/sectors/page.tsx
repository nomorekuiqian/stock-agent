import { KolPaidArea } from '@/components/KolPaidArea';
import StudioLayout from '../StudioLayout';
import { KolSubpage } from '@/components/KolSubpage';
import PaidPage from './PaidPage';
export async function generateMetadata({params}:{params:Promise<{username:string}>}){const {username}=await params;return {title:`${username} 研究资料`,robots:{index:false,follow:true},alternates:{canonical:`/kol/${username==='aleabitoreddit'?'serenity':username}/sectors`}};}
export default async function Page({params}:{params:Promise<{username:string}>}){const {username}=await params;return <KolSubpage slug={username} tab="sectors"><KolPaidArea><StudioLayout params={params}><PaidPage params={params} searchParams={Promise.resolve({})}/></StudioLayout></KolPaidArea></KolSubpage>;}
