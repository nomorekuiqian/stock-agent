// Curated coverage, not an exchange-wide security master.
export const STOCK_SECTORS = [
  { name: '半导体与硬件', sector: 'Technology', symbols: ['NVDA','AMD','AVGO','TSM','ARM','ASML','QCOM','MU','INTC','MRVL','SMCI','AAPL'] },
  { name: '软件与云服务', sector: 'Technology', symbols: ['MSFT','CRM','ORCL','ADBE','NOW','PLTR','SNOW','DDOG','NET','CRWD'] },
  { name: '银行与金融', sector: 'Financial Services', symbols: ['JPM','GS','MS','BAC','WFC','C','BLK','SCHW','AXP','BRK.B'] },
  { name: '支付与金融科技', sector: 'Financial Services', symbols: ['V','MA','PYPL','AFRM','FI','GPN','HOOD','COIN'] },
  { name: '零售与消费', sector: 'Consumer Cyclical', symbols: ['AMZN','HD','MCD','SBUX','NKE','TGT','BABA','PDD','JD','ABNB'] },
  { name: '必需消费', sector: 'Consumer Defensive', symbols: ['COST','WMT','PG','KO','PEP'] },
  { name: '汽车', sector: 'Consumer Cyclical', symbols: ['TSLA','NIO','LI','XPEV','RIVN','GM','F','LCID'] },
  { name: '医疗与制药', sector: 'Healthcare', symbols: ['UNH','JNJ','LLY','PFE','ABBV','MRK','TMO','AMGN','GILD','ISRG'] },
  { name: '能源', sector: 'Energy', symbols: ['XOM','CVX','COP','SLB','EOG','OXY','MPC','PSX','VLO'] },
  { name: '航空与国防', sector: 'Industrials', symbols: ['LMT','RTX','NOC','GD','BA','LHX','HII','TDG'] },
  { name: '互联网与媒体', sector: 'Communication Services', symbols: ['GOOGL','META','NFLX','DIS','SPOT','ROKU','BIDU','NTES','TME','BILI'] },
];
export const DIRECTORY_SYMBOLS = [...new Set(STOCK_SECTORS.flatMap(group => group.symbols))];
export function relatedStocks(symbol: string, sector?: string): string[] {
  const group = STOCK_SECTORS.find(group => group.symbols.includes(symbol));
  const matching = STOCK_SECTORS.filter(item => item.sector === (group?.sector || sector));
  return [...new Set([...(group?.symbols || []), ...matching.flatMap(item => item.symbols)])]
    .filter(item => item !== symbol).slice(0, 10);
}
