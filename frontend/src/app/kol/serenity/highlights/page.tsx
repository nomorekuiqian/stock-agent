import Page from '../../[username]/highlights/page';
export const metadata={title:'Serenity 研究资料',robots:{index:false,follow:true},alternates:{canonical:'/kol/serenity/highlights'}};
export default function SerenityPage(){return <Page params={Promise.resolve({username:'aleabitoreddit'})}/>;}
