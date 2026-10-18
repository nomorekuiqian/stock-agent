import Page from '../../[username]/stocks/page';
export const metadata={title:'Serenity 研究资料',robots:{index:false,follow:true},alternates:{canonical:'/kol/serenity/stocks'}};
export default function SerenityPage(){return <Page params={Promise.resolve({username:'aleabitoreddit'})}/>;}
