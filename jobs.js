/* --- 職業・目標パラメータ・資格データ --- */
const JOBS = [
  {
    id: "engineer",
    name: "Webエンジニア",
    reqLevel: 5,
    targetTotal: 500,
    weights: { intel: 0.4, act: 0.3, create: 0.2, mental: 0.1, body: 0.0, social: 0.0 },
    targets: { intel: 200, act: 150, create: 100, mental: 50, body: 0, social: 0 },
    certifications: {
      required: [
        { name: "基本情報技術者試験 (FE)", stat: "intel", exp: 100, desc: "ITエンジニアの登竜門。基礎知識の証明に最適。" }
      ],
      recommended: [
        { name: "応用情報技術者試験 (AP)", stat: "intel", exp: 200, desc: "ワンランク上のエンジニアを目指すための国家資格。" },
        { name: "AWS Certified Solutions Architect", stat: "act", exp: 150, desc: "クラウドインフラ構築の実務・スキル証明に強力。" }
      ]
    }
  },
  {
    id: "creator",
    name: "イラストレーター",
    reqLevel: 4,
    targetTotal: 450,
    weights: { create: 0.5, mental: 0.2, act: 0.2, intel: 0.1, body: 0.0, social: 0.0 },
    targets: { create: 225, mental: 90, act: 90, intel: 45, body: 0, social: 0 },
    certifications: {
      required: [],
      recommended: [
        { name: "色彩検定 (2級・1級)", stat: "create", exp: 100, desc: "配色や色彩理論の体系的な理解を証明。" },
        { name: "Photoshop / Illustrator クリエイター能力認定", stat: "create", exp: 80, desc: "デザインツールの実務操作スキルの証明。" }
      ]
    }
  },
  {
    id: "manager",
    name: "プロジェクトマネージャー",
    reqLevel: 8,
    targetTotal: 600,
    weights: { social: 0.3, mental: 0.3, act: 0.2, intel: 0.2, body: 0.0, create: 0.0 },
    targets: { social: 180, mental: 180, act: 120, intel: 120, body: 0, social: 0 },
    certifications: {
      required: [
        { name: "基本情報技術者試験 (FE)", stat: "intel", exp: 100, desc: "前提となるIT基礎知識。" }
      ],
      recommended: [
        { name: "PMP (Project Management Professional)", stat: "social", exp: 300, desc: "国際的に認知されているプロマネ最高峰資格。" },
        { name: "プロジェクトマネージャ試験 (PM)", stat: "intel", exp: 250, desc: "高度IT人材としての国定高度資格。" }
      ]
    }
  }
];
