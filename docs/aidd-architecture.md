# GHECにおけるAI駆動開発の設計：上位概念から下流設定まで（Gartner・GitHub公式・Googleを基にした叩き台、2026年11月時点）

GHECでAI駆動開発を設計するときの結論は、「ツールを配る」計画ではなく、ガードレール付きの「エージェント運用基盤」として設計することです。GHECの役割は、Copilot・サードパーティ製エージェント・MCPを、エンタープライズの単一のコントロールプレーンで統制することにあります。設計の重心は、Rulesets・GHAS・小さなバッチといった下流の品質ゲートと、DORAの安定性指標による計測に置くべきです。Gartner・GitHub・Googleの3者はいずれも、AIは成熟した組織を加速する一方、未成熟な組織では欠陥も増幅すると見ています。

## TL;DR

- **戦略：** Gartnerは、2028年までにエンタープライズのソフトウェアエンジニアの90%がAIコードアシスタントを使い（2024年初頭は14%未満）、開発者の役割は「実装」から「オーケストレーション」へ移ると予測しています。DORA 2025では、AI利用率は90%に達し、スループットは向上した一方で、デリバリーの不安定性も増していました。したがって投資の順序は「ツール配布 → 基盤（プラットフォーム・テスト・小さなバッチ・データアクセス）→ エージェント化」とすべきです。
- **GHEC設計：** Enterprise層の「AI Controls」で、エージェント（Copilot cloud agent／サードパーティ製エージェント）、MCP（レジストリと許可リスト）、モデル、データレジデンシー、メトリクスの各ポリシーを一元的に決めます。Organization層ではカスタムプロパティとRulesetsで適用範囲を絞り、Repository層では AGENTS.md や copilot-instructions.md、ファイアウォールで個別に制御します。2026年6月1日からは使用量課金（GitHub AI Credits）に移行したため、ユーザー単位・コストセンター単位の予算設計が必須です。
- **日本特有：** GHE.comのデータレジデンシーは日本リージョンでGAになっています（2025年12月18日のGitHub Changelogで発表）。しかし2026年11月時点で、Copilotの推論をリージョン内で完結させる機能は米国とEUのみが対象で、日本は2026年4月13日のGitHub Changelogで「2026年後半のロードマップ」とされた段階にとどまっています。日本リージョンを選んでも、Copilotの推論・プロンプト・ログは既定でリージョン外で処理されることを前提に、データ分類とリポジトリの範囲を設計する必要があります。

---

## Key Findings（3情報源の要点）

| 観点 | Gartner | GitHub公式 | Google（DORA／SAIF） |
|---|---|---|---|
| 基本認識 | AIネイティブSEはSDLC全体にAIを組み込み、AIがタスクの相当部分を自律的または半自律的に担う | GitHubを「Agent HQ」として、あらゆるエージェントを統合・統制する | AIは「増幅器」であり、強みも機能不全も拡大する\[1\] |
| 主要な数値 | 2028年までにエンジニアの90%がAIアシスタントを利用、2027年までにプラットフォームチームを持つ組織の70%がIDPに生成AI機能を組み込む | Copilot利用者2,000万人超（2025年7月30日の決算説明会でNadella氏が公表した累計ユーザー数で、アクティブ数ではない）、77,000社 | AI利用率90%、80%超が生産性向上を実感、30%はAI生成コードをほとんど／まったく信頼していない |
| 統制の考え方 | AI TRiSM、エージェント・インベントリ、ガードレール | エンタープライズのコントロールプレーン（ポリシー・監査ログ・メトリクス） | SAIF 2.0：エージェントには明確な人間の管理者を置き、権限を限定し、行動と計画を観測可能にする |
| 人の役割 | コーダーから「デジタル・コンダクター」へ | 人がレビューし、マージを判断する | Google社内では新規コードの75%がAI生成で、エンジニアが承認している\[2\] |
| リスク認識 | エージェント型AIプロジェクトの40%超が2027年末までに中止（2025年6月25日のプレスリリース。理由はコスト高騰、不明確な事業価値、不十分なリスク管理）、エージェントあたりの推論コストは5倍超に | コンテンツ除外がエージェントに効かないなど、機能ごとの制約\[3\] | 「検証税」と不安定性の増加\[4\] |

**共通点：** 3者とも、(1) AIはSDLC全体に及ぶ、(2) 人間による監督（human-in-the-loop）が必須、(3) プラットフォームエンジニアリングとガードレールが成否を分ける、(4) エージェントにはIDと権限の最小化が必要、という点で一致しています。

**違い：**
- Gartnerは市場と組織変革の予測が中心で、エージェントの乱立とコストへの警鐘が強い。
- GitHubは製品の統制機能（ポリシー・ルールセット・メトリクス）による実装論が中心で、マルチベンダーのエージェントを受け入れる。
- Googleは実証研究（DORA）とセキュリティの原則（SAIF）が中心で、ツールよりも組織の能力（小さなバッチ、ユーザー中心、データ）を重視する。

設計書では、Gartnerを「なぜ・どこへ」、DORAを「何を整えれば効果が出るか・どう測るか」、GitHubを「どう設定するか」、SAIFを「エージェントのセキュリティ原則」として使い分けるのが実務的です。

---

## レイヤー1：ビジョン・戦略

### 1-1. なぜAI駆動開発か（Gartner）
- Gartnerの2025年ソフトウェアエンジニアリング戦略トレンド（2025年7月1日）は、AIネイティブなソフトウェアエンジニアリングを「設計からデプロイまでSDLCの全フェーズにAIを組み込む」ものと定義しています。予測は「2028年までにエンタープライズのソフトウェアエンジニアの90%がAIコードアシスタントを利用（2024年初頭は14%未満）」です。そのうえで、開発者の役割は実装からオーケストレーションへ移り、「ビジネス上の重要度、リスク、ワークフローの複雑さを考慮して自動化と人間の監督のバランスを取る」必要があるとしています。\[5\]
- 同じリリースでGartnerは「GenAIプラットフォームエンジニアリング」も挙げ、2027年までにプラットフォームチームを持つ組織の70%が内部開発者プラットフォーム（IDP）に生成AI機能を組み込むと予測しています。\[5\]
- 2026年の戦略的テクノロジートレンド（2025年10月20日）では「AIネイティブ開発プラットフォーム」が取り上げられました。Gartnerは、2030年までに80%の組織が大規模なエンジニアリングチームをAIで強化された小規模で機敏なチームへ移行すると予測しています。\[6\]
- 研究要旨「Software Engineering Foundations for the AI-Native Era」（2025年8月）は、開発者を「コーダーからデジタル・コンダクターへ」転換できない組織は競争できないと述べ、5つの基礎プラクティスへの投資を推奨しています（本文は有料のため要旨のみ）。\[7\]

### 1-2. 市場の位置づけ（Gartner MQ）
- GitHubは「2025 Magic Quadrant for AI Code Assistants」（2025年9月15日）でLeaderに選ばれました。2026年には「Magic Quadrant for Enterprise AI Coding Agents」でもLeaderとされています（いずれもGitHub側の発表）。\[8\]\[9\]市場カテゴリの名称自体が「コードアシスタント」から「コーディングエージェント」へ変わっていることは、設計の前提（エージェント統制）を裏付けています。ただしMQは評価時点のスナップショットなので、ベンダー選定の唯一の根拠にはしないでください。

### 1-3. DORAの知見（Google）
- 「2025 State of AI-assisted Software Development」は、約5,000人の技術者への調査と100時間超の定性データに基づいています。主な結果は、AI利用率90%（前年比14ポイント増）、65%がAIに大きく依存、30%はAI生成コードを「少し」または「まったく」信頼していない、というものです。\[10\]
- 2024年と異なり、2025年はAI導入がスループットやプロダクトパフォーマンスと正の相関を示しました。一方で、デリバリーの安定性とは依然として負の相関です。\[10\]\[11\]DORAは「AIは開発を加速するが、その加速が下流の弱点を露呈させる。強力な自動テスト、成熟したバージョン管理、速いフィードバックループといった制御システムがなければ、変更量の増加は不安定性につながる」と説明しています。\[12\]
- 「DORA AI Capabilities Model」の7能力は次のとおりです。①明確に伝達されたAI方針、②健全なデータエコシステム、③AIがアクセスできる社内データ、④強固なバージョン管理の実践、⑤小さなバッチでの作業、⑥ユーザー中心の姿勢、⑦質の高い内部プラットフォーム。\[13\]\[14\]\[15\]\[16\]特に⑥は重要で、ユーザー中心の姿勢がないチームではAI導入がチームパフォーマンスを悪化させました。\[14\]\[16\]\[17\]
- 「ROI of AI-assisted Software Development」（2026年）はJカーブを示しています。導入直後は学習と検証税によって生産性がいったん落ち込みます（試算ツールの既定値は15%減が3か月続く想定）。\[11\]\[18\]効果を測る際は、この落ち込み期間を織り込んだ計画が必要です。

### 1-4. 成熟度ステージ（本設計での提案）
公開情報を統合し、次の4段階を設計上のステージとして提案します（Gartner・GitHub・DORAの公式モデルそのものではなく、筆者による整理です）。

| ステージ | 状態 | 主なGHEC機能 | 主要な判定指標 |
|---|---|---|---|
| S1 補完 | IDEでの補完・チャット | Copilot Business/Enterprise、コンテンツ除外 | 週次アクティブ率 |
| S2 対話型エージェント | IDEのエージェントモード、MCP | MCPポリシーとレジストリ、カスタム指示 | エージェント利用率、PRのリードタイム |
| S3 非同期エージェント | Copilot cloud agentにIssueを割り当てる、Copilotコードレビュー | Rulesets、ファイアウォール、Actionsランナー | 変更失敗率、手戻り率、レビュー待ち時間 |
| S4 エージェント・オーケストレーション | Agent HQ／Mission Controlで複数ベンダーのエージェントを並行運用 | サードパーティ製エージェントポリシー、予算、監査ログのストリーミング | DORA指標とコスト／成果単価 |

**提言：** S3へ進む条件として、「DORAの安定性指標（変更失敗率・デプロイ手戻り率）が悪化していないこと」をゲートに設定してください。

---

## レイヤー2：ガバナンス・リスク管理

### 2-1. フレームワークの対応
- **Gartner AI TRiSM：** Gartnerは2026年4月28日、エージェントの乱立（スプロール）を管理する6ステップを公表しました。予測は「2028年までに平均的なFortune 500企業は15万超のエージェントを利用」、そして「適切なエージェントガバナンスを持つと考える組織は13%のみ」です。ステップの1つが、AI TRiSMツールを使った集中型のエージェント・インベントリの構築です。また、単に禁止するとシャドーAIを誘発するとして、「承認済みツール内での安全な権限付与」を推奨しています。\[19\]
- **Google SAIF 2.0：** エージェント向けに拡張され、3原則を掲げています。①エージェントには明確に定義された人間の管理者がいる、②権限は慎重に制限される、③行動と計画は観測可能である。これに、決定論的な制御と推論ベースの防御を組み合わせた多層防御を加えます。\[20\]\[21\]
- **GitHub：** Agent HQの「コントロールプレーン」で、ポリシー管理、監査ログ、AIアクセス（エージェント・MCP）の管理を一元化します。\[22\]\[23\]

**GHECへの対応表（設計の核）：**

| 原則 | GHECでの実装 |
|---|---|
| 人間の管理者（SAIF①） | cloud agentのPRは起動したユーザーに紐づく。「帰属のないCopilot PRに追加承認を要求」するルール（プレビュー）、CODEOWNERS、必須レビュー\[24\] |
| 権限の限定（SAIF②） | cloud agentはOrg単位・リポジトリ単位で有効化し、エージェントファイアウォールで外部ホストを許可リスト化。MCPはレジストリのみ許可。書き込み先はCopilot用ブランチに限定 |
| 観測可能性（SAIF③） | 監査ログ（copilot.*イベント）をSIEMへストリーミング、エージェントのセッションログ、使用量メトリクスAPI |
| インベントリ（Gartner TRiSM） | AI Controlsで「利用可能なエージェント」を一覧化し、MCPレジストリを社内の唯一の正（Source of Truth）とする |

### 2-2. データ保護・知財
- **コンテンツ除外の限界（重要）：** GitHub Docsは、コンテンツ除外がEdit／Agentモード、Copilot CLI、Copilot cloud agentでは「サポートされない」と明記しています。\[3\]\[25\]\[26\]秘密情報を含むリポジトリでは、コンテンツ除外を隔離策とみなしてはいけません。\[27\]リポジトリ単位でcloud agentを無効にする、MCPを禁止する、といった権限側の統制を主とし、加えて秘密情報はそもそもリポジトリに置かないようにします（push protection）。
- **IP補償：** Microsoftの「Customer Copyright Commitment Required Mitigations」によれば、2026年4月3日以降、GitHub製品についてはDuplicate Detectionフィルター（「公開コードに一致する提案」をBlock）がCCCの適用条件ではなくなりました。\[28\]\[29\]ただし、GitHubのTrust Center FAQやサードパーティのガイドには旧記述が残っている場合があります。\[30\]法務確認の際は最新のProduct TermsとCCCページを一次資料にしてください。運用上は、OSSライセンス管理の観点からBlockを既定とし、例外を申請制にするのが保守的な選択です。
- **データレジデンシー：** レイヤー4と「日本企業特有の考慮事項」を参照してください。

### 2-3. 利用ポリシー（AI方針）
DORAの能力①「明確に伝達されたAI方針」に対応する社内文書として、少なくとも次を定めます。
1. 許可ツールと許可モデル（AI Controlsのモデルポリシーと一致させる）
2. 扱ってよいデータ分類（機密区分ごとのcloud agentとMCPの可否）
3. AI生成コードの責任（PR作成者または起動者が説明責任を負い、AIは作成者にならない）
4. 禁止事項（個人ライセンスやシャドーAIの業務利用など）
5. 例外申請と監査の手順

### 2-4. 役割と責任（RACI案）

| 領域 | Enterprise Owner／AI Manager | プラットフォームチーム | セキュリティ（CISO） | 法務・知財 | 開発チーム |
|---|---|---|---|---|---|
| AI Controlsのポリシー | A | R | C | C | I |
| MCPレジストリの審査 | I | R | A | C | C |
| Rulesetsとリポジトリの標準 | C | A/R | C | I | C |
| 予算とライセンス | A | R | I | I | I |
| AI生成コードの品質責任 | I | C | C | I | A/R |

※「AI manager」はGitHub Docs上、エンタープライズのcloud agentポリシーを設定できる権限として登場する役割です。\[31\]

---

## レイヤー3：組織・運用モデル

- **CoE（AI Enablement CoE）＋プラットフォームチーム：** Gartnerの「GenAIプラットフォームエンジニアリング」は、セルフサービスの開発者ポータルでAI機能を発見しやすくし、ガバナンスを組み込むことを推奨しています。\[5\]DORAも「質の高い内部プラットフォーム」を7能力の1つに挙げ、「舗装道路（paved road）」としてガードレールと自動テストを提供することを求めています。\[13\]\[15\]GHECでは、プラットフォームチームが次をテンプレート化して配布するのが中心になります。
  - リポジトリテンプレート（AGENTS.md、.github/copilot-instructions.md、.github/instructions/*.instructions.md、プロンプトファイル、copilot-setup-steps.yml）
  - Org単位のRulesets
  - MCPレジストリ
  - 推奨エージェント構成
- **人材：** Gartnerは2027年までに、ソフトウェアエンジニアリングリーダーの職務記述書の70%が生成AIの監督を明示的に求めるようになると予測し（現在は40%未満）、HRと連携した階層別のAI研修を推奨しています。また、DevOps・DataOps・ModelOpsにまたがる責任分担を明確にするポリシーも推奨しています。\[32\]
- **人の役割の変化：** GoogleのPichai CEOは2026年4月22日のブログ投稿（Google Cloud Next）で、「Googleの新規コードの75%はAIが生成し、エンジニアが承認している」と述べました（2024年秋は25%、2025年秋は50%）。さらに、エージェントとエンジニアが協働した複雑なコード移行が1年前の6倍の速さで完了したと説明しています。\[2\]これは自社による公表値で、独立した検証は行われていません。\[33\]重要なのは、人の役割が「書く」から「レビューして承認する」へ移っている点です。\[34\]レビュー能力（設計・セキュリティ・テスト設計）の育成が教育の中核になります。
- **変革管理：** DORAは、AIトークン消費量をランキング化する「tokenmaxxing」が容易に悪用されると警告しています（2026年6月）。\[4\]\[35\]利用量を表彰するのではなく、成果指標で評価してください。
- **Human-in-the-loopの原則（本設計）：** エージェントは提案者または作成者として扱い、マージ権限は人が持ちます。Copilotの承認を必須承認数に算入できる機能が登場していますが（サードパーティの報告では2026年10月にGA）、初期段階では無効のままにし、少なくとも人による承認1件とCODEOWNERSを必須にすることを推奨します。\[24\]\[36\]

---

## レイヤー4：GHECアーキテクチャ設計

### 4-1. 階層とポリシー配置の原則
**「Enterpriseで上限を決め、Orgで適用範囲を決め、Repoで文脈を与える」**

| 階層 | 主な設定（2026年11月時点の名称） | 推奨値（叩き台） |
|---|---|---|
| Enterprise（AI Controls） | Copilot cloud agent／「Copilot in the cloud」ポリシー、サードパーティ製エージェント、MCP servers in Copilot、MCP Registry URLと「Registry only」、モデルポリシー、データレジデンシー準拠モデルへの制限、Copilot usage metrics、Copilotコードレビューの自動リクエスト、Copilotによる承認の可否 | cloud agentは「選択したOrgで有効」から開始。MCPは有効にしたうえで「Registry only」。メトリクスは有効。Copilotの承認は無効 |
| Enterprise managed settings | .github-privateリポジトリの copilot/managed-settings.json（IDE、CLI、Copilotアプリ、cloud agentに適用。MCPの allowedMcpServers／deniedMcpServers など） | MCPの許可リストと拒否リスト、既定モデル、プラグインやマーケットプレイスの制御をコード管理し、PRレビューで変更する |
| Organization | cloud agentのリポジトリアクセス（全部／選択）、エージェントファイアウォール、Org Rulesets、カスタムプロパティ、コードレビュー用ランナー | 機密区分を表すカスタムプロパティでcloud agentの適用範囲を制御。ファイアウォールは有効にし、許可ホストは最小限 |
| Repository | AGENTS.md、copilot-instructions.md、パス別の指示、copilot-setup-steps.yml、cloud agentのオプトアウト、CODEOWNERS | 全リポジトリのテンプレートに含める |

補足（GitHub公式）：
- Business/Enterpriseでは、Copilot cloud agentとサードパーティMCPは**既定で無効**で、管理者が有効化する必要があります。\[37\]\[38\]\[39\]
- 2026年4月15日から、Enterpriseはcloud agentを「選択したOrgで有効」にでき、Orgのカスタムプロパティで指定できます（評価は設定時の1回のみ）。REST APIでも設定できます。\[40\]\[41\]
- GitHub Docsでは、cloud agent、GitHub上のチャット、モバイルのチャットの個別ポリシーが「**Copilot in the cloud**」ポリシーに統合されたと説明されています。有効化するとクラウドサンドボックスも利用可能になり、個別には無効化できません。\[42\]名称が移行期にあるため、設計書には「どのUI名称で設定したか」を記録してください。
- サードパーティの報告によると、2026年10月22〜26日に「未構成（Unconfigured）」のポリシーへ既定値を適用する変更が展開されました。\[43\]対象はFeatures & clients、Copilotコードレビュー、MCP servers in Copilotです。**意図しない有効化を防ぐため、\[44\]すべてのポリシーを明示的に設定する**ことを推奨します。

### 4-2. MCP設計
- 前提：「MCP servers in Copilot」ポリシーは既定で無効です。対象はBusiness/Enterpriseのシートのみで、Free/Pro/Pro+の利用者には適用されません。また、Cursorなどサードパーティのホストから使うGitHub MCPサーバーも統制できません。\[44\]\[45\]\[46\]
- 推奨構成は次の3つの組み合わせです。
  1. 社内MCPレジストリ（Azure API Center などで、MCP v0.1レジストリ仕様に準拠）\[47\]\[48\]
  2. 「Registry only」
  3. managed-settings.json の allowedMcpServers（serverUrl のワイルドカードまたは serverCommand で一致判定。serverName での一致はセキュリティ制御ではない）\[46\]
- 注意：Registry onlyは名前やIDで照合する方式のため、設定ファイルの編集で回避されうるとGitHub自身が説明しています（プレビュー段階）。\[48\]また、cloud agentはレジストリも管理された許可リストも読まないため、cloud agentのMCPはリポジトリ設定側で別途審査する必要があります。\[49\]高リスクな部門では「MCP無効」も選択肢です。

### 4-3. ID・EMU
- EMUとIdP連携（Entra ID／Okta、SCIM）を前提とし、Copilotライセンスはグループ単位で割り当てて、ライフサイクルをIdPと連動させます。GHE.com（データレジデンシー版）は概念的にEMUと同じ形態です。\[50\]
- EMUの制約に注意してください。たとえば、Copilotの予算増額リクエスト機能（2026年9月GA）は「managed users を持つエンタープライズでは利用不可」です。\[51\]また、cloud agentはマネージドユーザーアカウントが所有する個人リポジトリでは使えません（Docsの記載）。\[52\]

### 4-4. ライセンスとコスト
- **2026年6月1日から使用量課金に移行しました。** プレミアムリクエストはGitHub AI Credits（1クレジット＝0.01ドル）に置き換わり、トークン消費量に応じて課金されます。Copilotコードレビューは**AI Creditsに加えてActionsの分数も消費**します。\[53\]\[54\]\[55\]
- 予算は、エンタープライズ、Org、コストセンター、ユーザーの4階層で設定できます。ユーザー単位の予算は2026年6月1日にGAとなり、AI Creditsについては「追加支出だけでなく総使用量」を制御します。予算増額リクエストのフローは2026年9月16日にGAです。\[51\]\[53\]\[56\]
- **Gartnerの警告：** 2026年8月17日の予測で、エージェント型ワークフローあたりの推論コストは2028年までに5倍超に増えるとしています（「推論のパラドックス」）。\[57\]単価が下がっても総額は上がる前提で、部門別のコストセンター、ユーザー単位の既定予算、モデルポリシー（高価なモデルは申請制）を組み合わせてください。
- 価格（Business 19ドル、Enterprise 39ドル／ユーザー／月。同額相当のAI Creditsを含む）は報道ベースです。\[58\]契約前に必ず正式見積もりを取ってください。

### 4-5. ネットワーク・監査
- cloud agentはGitHub Actions上の一時的な環境で動きます。\[59\]エージェントファイアウォールで外部アクセスを許可リスト化し、\[39\]社内リソースへのアクセスが必要ならセルフホストランナーやAzureプライベートネットワーキングを検討します。プロキシ環境では、IDE側のCopilot用ドメインの許可を「Configuring network settings」に沿って設定します。
- 監査ログはSIEM（Splunk／Sentinelなど）にストリーミングし、Copilotポリシーの変更やコードレビュー設定の変更（例：copilot.code_review_*_settings_updated）を検知ルール化します。\[24\]

---

## レイヤー5：開発ライフサイクルへの組み込み

| 段階 | AI活用（GitHub機能） | ガードレール | 根拠 |
|---|---|---|---|
| 計画 | Copilotでのissue作成、プランモード、Mission Controlでのタスク割り当て | issueテンプレートに受け入れ基準を必須化 | DORA：ユーザー中心、小さなバッチ |
| コーディング | IDEのエージェントモード、cloud agentへのissue割り当て、サードパーティ製エージェント | AGENTS.md／カスタム指示、MCPはレジストリのみ、cloud agentはCopilot用ブランチのみ | SAIF②（権限の限定） |
| レビュー | Copilotコードレビュー（Rulesetsで自動リクエスト、「新しいプッシュをレビュー」）\[60\] | 人の承認1件以上、CODEOWNERS、帰属のないCopilot PRへの追加承認 | SAIF①、DORA：検証税 |
| テスト | エージェントによるテスト生成、Actionsでの必須ステータスチェック | エージェントのPRもCIを必須化（ドラフトPRのワークフロー実行には承認が必要） | DORA：自動テストは制御システム |
| セキュリティ | GHAS：code scanningとCopilot Autofix、secret scanningとpush protection、dependency review | Rulesetsでcode scanningの結果を必須化 | Gartner：ガードレール |
| デプロイ | Actionsと環境保護ルール | 本番環境は人の承認、小さなバッチ、即時ロールバック | DORA：バージョン管理と小さなバッチ |
| 運用 | エラー追跡やログ用MCPをcloud agentに接続し、障害issueを自動修正PRにつなげる | 修正PRも同じゲートを通す | SAIF③（観測可能性） |

**Rulesetsの標準セット（叩き台）：**
1. デフォルトブランチへのPR必須（承認1件以上、Code Owners必須）
2. 必須ステータスチェック（ビルド・テスト・CodeQL）
3. 「Automatically request Copilot code review」と「Review new pushes」\[60\]
4. 線形履歴と強制プッシュ禁止
5. 本番ブランチへのバイパスはプラットフォームチームのみ

なお、2026年8月7日以降、Code Qualityを有効にしてもCopilotレビュー用のRulesetは自動作成されなくなりました。明示的に作成してください。\[61\]

**コーディングエージェントのワークフロー（標準形）：**
1. issueに受け入れ基準と対象範囲を書く
2. Copilot（またはサードパーティ製エージェント）に割り当てる
3. エージェントがブランチを作成し、copilot-setup-steps.ymlで準備した環境で実装する
4. PRを作成し、Copilotコードレビューを経て人がレビューする
5. CIとGHASのゲートを通す
6. 人がマージする

cloud agentの制約（1セッションは1リポジトリ・1ブランチ・1PR）を踏まえ、タスクは小さく切ってください。\[27\]

---

## レイヤー6：計測・改善

- **GitHubの計測基盤：** Copilot使用量メトリクスのダッシュボードとAPIは2026年2月27日にGAとなり、旧APIは2026年4月2日に停止しました。\[62\]\[63\]\[64\]エンタープライズの「Copilot usage metrics」ポリシーを有効にする必要があります。取得できる指標は、日次・週次アクティブ、エージェント導入率、機能別・モデル別・言語別の利用、コード生成ダッシュボード（ユーザー起点とエージェント起点の追加・削除行数）です。\[65\]\[66\]2026年11月には、コードレビューの詳細と「指摘への対応率」も追加されました。GHE.comでもメトリクスが利用できます（2026年1月時点ではパブリックプレビュー）。\[67\]
- **注意：** GitHubは、行数（LoC）指標を「方向性を示す指標」と位置づけています。一部のIDEではエージェントの操作が過少計上されることもあります。\[68\]\[69\]\[70\]DORAも「AIはコード量を容易に膨らませるので、出力ベースの指標で生産性を測るのをやめるべき」と述べています。\[4\]

**指標体系（推奨）：**

| 層 | 指標 | 出典 |
|---|---|---|
| 導入 | 週次アクティブ率、エージェント利用率、ライセンス稼働率 | GitHubメトリクスAPI |
| フロー | リードタイム、デプロイ頻度、PRレビュー待ち時間（AI起点のPRと人起点のPRで比較） | DORA、GitHub API |
| 安定性 | 変更失敗率、デプロイ手戻り率、復旧時間 | DORA（AI導入時に悪化しやすい） |
| 品質・セキュリティ | Autofixの適用率、脆弱性の平均修正時間、Copilotレビュー指摘への対応率 | GHAS、メトリクスAPI |
| 人 | 開発者満足度、認知負荷、AIへの信頼度（SPACEの考え方） | サーベイ |
| 経済性 | AI Credits／マージ済みPR、AI Credits／リードタイム短縮日数 | 請求API |

ROIはDORAのJカーブを前提に、四半期単位で評価します。\[18\]最初の1四半期の落ち込みを失敗と判定しないよう、経営層と事前に合意しておきます。

---

## レイヤー7：導入ロードマップ

| フェーズ | 期間（目安） | 内容 | 出口基準 |
|---|---|---|---|
| 0. 基盤 | 0〜2か月 | EMUとIdP連携、AI方針の策定、全ポリシーの明示設定、監査ログのストリーミング、メトリクス有効化、Rulesetsの標準化、データ分類とカスタムプロパティ | ポリシーの「未構成」がゼロ、DORAのベースライン取得 |
| 1. PoC | 1〜2か月 | 2〜3チームでIDE補完とエージェントモード、MCPはレジストリ1〜3件のみ | 週次アクティブ率70%以上、重大インシデントなし |
| 2. パイロット | 2〜3か月 | 対象Orgでcloud agentとCopilotコードレビューを有効化、ユーザー予算の設定、AGENTS.mdテンプレートの配布 | 変更失敗率が悪化しない、コストが予算内 |
| 3. 全社展開 | 3〜6か月 | カスタムプロパティでOrgを段階的に追加、CoEによる研修とチャンピオン制度 | 導入率と安定性の両立 |
| 4. 最適化・エージェント化 | 継続 | サードパーティ製エージェントの評価、運用（SRE）連携、モデルとコストの最適化 | 成果単価の継続的な改善 |

**チェックリスト（抜粋）：**
- [ ] AI Controlsのすべてのポリシーを明示的に設定した（10月の既定値適用への対応）
- [ ] cloud agentは「選択したOrg」で有効化し、機密リポジトリはオプトアウトした
- [ ] MCPはレジストリと「Registry only」、managed-settings.jsonの許可リストで統制し、cloud agentのMCPは別途審査している
- [ ] コンテンツ除外がエージェントに効かない前提で、機密リポジトリを分離した
- [ ] Rulesets：人の承認、CODEOWNERS、CI、CodeQL、Copilot自動レビュー
- [ ] Copilotの承認を必須承認数に算入する設定は無効にした
- [ ] 予算：エンタープライズ、コストセンター、ユーザー既定の各予算とアラート
- [ ] 監査ログのストリーミングとcopilot.*の検知ルール
- [ ] メトリクス：GitHubメトリクスとDORA指標のダッシュボード
- [ ] IP補償の条件を法務が最新のCCC／Product Termsで確認した
- [ ] データレジデンシー：Copilotの処理場所を法務とセキュリティが承認した

---

## 日本企業特有の考慮事項

1. **データレジデンシーの「保存」と「推論」を分けて考える：** GHE.comのデータレジデンシーは、2025年12月18日のGitHub Changelogで日本リージョンのGAが発表され、コードとユーザーデータは国内に保存できます。しかしGitHub Docsは、Copilotのデータとログについて「既定ではリージョン外に保存」と明記しています。\[71\]リージョン内での推論（「Restrict Copilot to data residency compliant models」ポリシー）は2026年11月8日時点で米国とEUのみ対応で、日本とオーストラリアは2026年4月13日のGitHub Changelogで「2026年後半のロードマップ」とされたままです。リリース状況はGitHub Changelogで随時確認してください。
2. **対応しない場合の選択肢：**
   - (a) 個人情報保護法の越境移転やFISC安全対策基準などに照らして、国外処理を許容するかどうかを法務とセキュリティが判断し、委託先管理として文書化する
   - (b) 高機密のリポジトリはcloud agentとMCPを無効にし、補完のみにするなど利用範囲を分ける
   - (c) BYOKで国内リージョンのモデルを使う構成を検討する（サードパーティの解説ベースのため、プロキシ経由の経路を含めて要検証）\[72\]
3. **コスト：** GitHub Changelog（2026年4月13日）によれば、データレジデンシーを強制するとモデル乗数が10%増えます（現行DocsではAI Creditsの消費が1.1倍）。日本対応後に有効化する場合は予算に織り込んでください。
4. **言語：** AGENTS.mdやカスタム指示で、日本語でのPR説明やコメント規約を明示します。DORAの2025年レポートには日本語版があり、社内の合意形成に使えます。\[73\]
5. **商習慣：** 受託開発やSIer経由の開発では、委託先のAI利用規程、成果物の権利、IP補償の範囲を契約に明記します（GitHubのIP補償は契約者であるBusiness/Enterprise顧客に対するもの）。\[30\]\[74\]

---

## Caveats

- GitHubのAI機能は名称と仕様の変更が非常に速いため、本書の設定名は2026年11月時点の公開情報に基づきます。たとえば、coding agentは2026年にcloud agentへ名称変更され、さらに「Copilot in the cloud」ポリシーへの統合が進んでいます。\[27\]実装時は必ずGitHub DocsとChangelogで再確認してください。
- Gartnerについては、プレスリリースと公開要旨のみを使用しました。有料レポート本文の推奨事項は反映していません。MQの位置づけはGitHubやAWSなどベンダー側の発表を経由した情報です。\[8\]\[75\]
- DORAの生産性や信頼度の数値は自己申告サーベイに基づきます（スループットや安定性も相関関係であり、因果関係ではありません）。\[10\]\[76\]Googleの「新規コードの75%がAI生成」は自社による公表値で、独立した検証は行われていません。\[33\]\[77\]
- 価格、Copilotの承認機能のGA日、10月の既定値適用、MCP許可リストのGA日の一部は、サードパーティの記事に基づきます。契約や本番設定の前に一次資料で確認してください。
- 成熟度ステージとRACIは、公開情報を統合した本書独自の提案です。

## 出典

1. [DORA Community Discussion - State of AI-assisted Software Development - YouTube](https://www.youtube.com/watch?v=Sz8NWaTiWfE)
2. [Google CEO says 75% of the company’s code is AI-generated - Fast Company](https://www.fastcompany.com/91531519/google-ceo-says-75-of-the-companys-code-is-ai-generated)
3. [GitHub Copilot security risks: what content exclusion doesn't cover (Agent mode, MCP, CLI) - DEV Community](https://dev.to/momin_aziz_1/github-copilot-security-risks-what-content-exclusion-doesnt-cover-agent-mode-mcp-cli-3fj4)
4. [DORA Metrics: All 5, With 2025 Benchmarks and AI](https://re-cinq.com/topics/dora-metrics)
5. <https://www.gartner.com/en/newsroom/press-releases/2025-07-01-gartner-identifies-the-top-strategic-trends-in-software-engineering-for-2025-and-beyond>
6. [Gartner Identifies the Top Strategic Technology Trends for 2026](https://www.gartner.com/en/newsroom/press-releases/2025-10-20-gartner-identifies-the-top-strategic-technology-trends-for-2026)
7. [Software Engineering Foundations for the AI-Native Era](https://www.gartner.com/en/documents/6852666)
8. [Gartner positions GitHub as a Leader in the 2025 Magic Quadrant for AI Code Assistants for the second year in a row - The GitHub Blog](https://github.blog/ai-and-ml/github-copilot/gartner-positions-github-as-a-leader-in-the-2025-magic-quadrant-for-ai-code-assistants-for-the-second-year-in-a-row/)
9. [GitHub recognized as a Leader by 2026 Gartner® Magic Quadrant™ for Enterprise AI Coding Agents · GitHub](https://github.com/resources/whitepapers/gartner-magic-quadrant-and-critical-capabilities-for-ai-code-assistants)
10. [DORA](https://dora.dev/insights/balancing-ai-tensions/)
11. [New DORA Report Claims Strong Engineering Foundations Drive AI Return on Investment - InfoQ](https://www.infoq.com/news/2026/05/dora-roi-ai-assisted-dev-report/)
12. [Announcing the 2025 DORA Report](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report)
13. [DORA Report 2025 Key Takeaways: AI Impact on Dev Metrics](https://www.faros.ai/blog/key-takeaways-from-the-dora-report-2025)
14. [DORA 2025: AI Amplifies Your Strengths (and Your Weaknesses)](https://lcmh.fr/en/articles/2026/dora-2025-ai-amplifier-software-development/)
15. [State of DevOps 2025: Review of the DORA Report on AI Assisted Software Development](https://www.splunk.com/en_us/blog/learn/state-of-devops.html)
16. [DORA 2025 Report: How AI Is Reshaping Development - Opsera](https://opsera.ai/blog/dora-2025-report-ai-software-development)
17. [AI Doesn't Fix What's Already Broken: What DORA's New Model Tells Us About Getting AI Right - Techstrong.ai](https://techstrong.ai/features/ai-doesnt-fix-whats-already-broken-what-doras-new-model-tells-us-about-getting-ai-right/)
18. [DORA 2026 Report Summary: ROI of AI-Assisted Development](https://ingenire.com/blog/dora-2026-ai-amplifier)
19. [Gartner Identifies Six Steps to Manage AI Agent Sprawl](https://www.gartner.com/en/newsroom/press-releases/2026-04-28-gartner-identifies-six-steps-to-manage-artificial-intelligence-agent-sprawl)
20. [Google's Approach for Secure AI Agents](https://research.google/pubs/an-introduction-to-googles-approach-for-secure-ai-agents/)
21. [Google’s AI security strategy](https://blog.google/innovation-and-ai/technology/safety-security/ai-security-frontier-strategy-tools/)
22. [GitHub Introduces Agent HQ to Orchestrate 'Any Agent Any Way You Work' -- Visual Studio Magazine](https://visualstudiomagazine.com/articles/2025/10/28/github-introduces-agent-hq-to-orchestrate-any-agent-any-way-you-work.aspx)
23. [GitHub Copilot surges as Agent HQ targets AI ecosystem](https://cfotech.news/story/github-copilot-surges-as-agent-hq-targets-ai-ecosystem)
24. [Copilot Can Now Approve Pull Requests. Should It Count Toward Your Branch Protection? - DEV Community](https://dev.to/pwd9000/copilot-can-now-approve-pull-requests-should-it-count-toward-your-branch-protection-2b78)
25. [GitHub Copilot Privacy: Safeguards and Troubleshooting Guide](https://www.datacamp.com/tutorial/github-copilot-privacy-and-troubleshooting)
26. [Copilot Content Exclusions: Four Layers of Defense](https://blog.cloud-eng.nl/2026/03/13/copilot-content-exclusions-four-layers/)
27. [What Is GitHub Copilot Cloud Agent? Agent Mode, Tasks, Limits, and Review - SmartScope](https://smartscope.blog/en/generative-ai/github-copilot/github-copilot-coding-agent-guide/)
28. [Customer Copyright Commitment Required Mitigations - Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/customer-copyright-commitment?view=foundry-classic)
29. [The AI Indemnity You Already Have](https://c4site.com.au/articles/ai-indemnity-you-already-have/)
30. [Trust Center - github.com](https://copilot.github.trust.page/faq?s=b9buqrq7o9ssfk3ta50x6)
31. [docs/content/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/enable-copilot-cloud-agent.md at main · github/docs · GitHub](https://github.com/github/docs/blob/main/content/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/enable-copilot-cloud-agent.md)
32. [Generative AI is Redefining the Role of Software Engineering Leaders](https://www.gartner.com/en/newsroom/press-releases/2025-05-08-generative-ai-is-redefining-the-role-of-software-engineering-leaders)
33. [How Much Code Is Written by AI in 2026? The Real Numbers - Second Talent](https://www.secondtalent.com/resources/how-much-software-written-by-ai/)
34. [Google CEO: 75% of All New Code at Google Is Now AI-Written](https://www.bitsminds.com/news/google-sundar-pichai-75-percent-ai-generated-code-cloud-next-2026)
35. [DORA](https://dora.dev/insights/)
36. [How do I make sure Copilot review is completed before PR can be auto merged? - DEV Community](https://dev.to/izgorodin/how-do-i-make-sure-copilot-review-is-completed-before-pr-can-be-auto-merged-3kjh)
37. [Enabling GitHub Copilot cloud agent in your enterprise - GitHub Docs](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/enable-copilot-cloud-agent)
38. [Managing access to GitHub Copilot cloud agent - GitHub Enterprise Cloud Docs](https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/enterprise/cloud-agent-access)
39. [Adding GitHub Copilot cloud agent to your organization - GitHub Enterprise Cloud Docs](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/administer-copilot/manage-for-organization/add-copilot-cloud-agent)
40. [Enable Copilot cloud agent via custom properties - GitHub Changelog](https://github.blog/changelog/2026-04-15-enable-copilot-cloud-agent-via-custom-properties/)
41. [REST API endpoints for Copilot cloud agent management - GitHub Docs](https://docs.github.com/en/rest/copilot/copilot-coding-agent-management?apiVersion=2026-03-10)
42. [Managing GitHub Copilot in the cloud for your enterprise or organization - GitHub Docs](https://docs.github.com/en/copilot/concepts/enterprise/cloud-agent-access)
43. [How to disable Copilot code review in GitHub? - DEV Community](https://dev.to/izgorodin/how-to-disable-copilot-code-review-in-github-56g3)
44. [GitHub Copilot Feature Defaults Roll Out Through October 26: Enterprise and MCP Policy Checklist](https://aicybr.com/blog/github-copilot-feature-defaults-october-2026-enterprise-mcp-policy)
45. [Extending GitHub Copilot Chat with Model Context Protocol (MCP) servers - GitHub Docs](https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp)
46. [VS Code MCP Setup: mcp.json for Copilot Agent Mode](https://mcpstepbystep.com/learn/vscode-copilot-mcp/)
47. [Restrict MCP server access to a custom registry - GitHub Docs](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-mcp-server-access)
48. [MCP Server Registries for UK Enterprises](https://neuraltrust.ai/blog/mcp-registry-allowlist-enterprise)
49. [How to control MCP servers in GitHub Copilot](https://nirmata.com/2026/10/25/how-to-control-mcp-servers-in-github-copilot/)
50. [What's this GHEC with Data Residency and how can I get started? · community · Discussion #154493 · GitHub](https://github.com/orgs/community/discussions/154493)
51. [Copilot budget increase requests are generally available - GitHub Changelog](https://github.blog/changelog/2026-09-16-copilot-budget-increase-requests-are-generally-available/)
52. [manage copilot coding agent](https://docs.github.com/ja/enterprise-cloud@latest/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-copilot-coding-agent)
53. [Updates to GitHub Copilot billing and plans - GitHub Changelog](https://github.blog/changelog/2026-06-01-updates-to-github-copilot-billing-and-plans/)
54. [GitHub Copilot is moving to usage-based billing · community · Discussion #192948 · GitHub](https://github.com/orgs/community/discussions/192948)
55. [GitHub Copilot Enterprise pricing \[2026\]: seats, AI credits, and the September cliff](https://www.cloudzero.com/blog/github-copilot-enterprise-pricing/)
56. [GitHub Copilot is Moving to Usage-Based Billing from June 1, 2026](https://cloud-authority.com/github-copilot-is-moving-to-usage-based-billing-from-june-1-2026)
57. [Gartner Predicts AI Inference Costs Per Agentic Workflow Will Increase More Than Fivefold Through 2028](https://www.gartner.com/en/newsroom/press-releases/2026-08-17-gartner-predicts-ai-inference-costs-per-agentic-workflow-will-increase-more-than-fivefold-through-2028)
58. [Devs Sound Off on Usage-Based Copilot Pricing Change: 'You Will Get Less, but Pay the Same Price' -- Visual Studio Magazine](https://visualstudiomagazine.com/articles/2026/04/27/devs-sound-off-on-usage-based-copilot-pricing-change-you-will-get-less-but-pay-the-same-price.aspx)
59. [GitHub Agent HQ: Features, Pricing & Agent Workflow](https://www.therundown.ai/tools/agent-hq)
60. [configure automatic review](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/configure-automatic-review)
61. [GitHub Code Quality no longer adds Copilot as a reviewer - GitHub Changelog](https://github.blog/changelog/2026-08-07-github-code-quality-no-longer-adds-copilot-as-a-reviewer/)
62. [6 GitHub Copilot Usage Dashboards and Monitoring Tools for 2026](https://www.toriihq.com/articles/six-github-copilot-usage-dashboards-and-monitoring-tools)
63. [Copilot usage metrics dashboard and API in public preview · community · Discussion #177273 · GitHub](https://github.com/orgs/community/discussions/177273)
64. [GitHub - github-copilot-resources/copilot-metrics-viewer: Tool to visualize the Copilot metrics provided via the Copilot Business Metrics API · GitHub](https://github.com/github-copilot-resources/copilot-metrics-viewer)
65. [Track Copilot code generation metrics in a dashboard - GitHub Changelog](https://github.blog/changelog/2025-12-05-track-copilot-code-generation-metrics-in-a-dashboard/)
66. [Copilot usage metrics dashboard and API in public preview - GitHub Changelog](https://github.blog/changelog/2025-10-28-copilot-usage-metrics-dashboard-and-api-in-public-preview/)
67. [Copilot metrics in GitHub Enterprise Cloud with data residency in public preview - GitHub Changelog](https://github.blog/changelog/2026-01-29-copilot-metrics-in-github-enterprise-cloud-with-data-residency-in-public-preview/)
68. [GitHub Copilot Usage Metrics Question - Lines Generated in Agent Mode Not Tracked? · community · Discussion #186034 · GitHub](https://github.com/orgs/community/discussions/186034)
69. [Lines of Code metrics - GitHub Docs](https://docs.github.com/en/copilot/reference/copilot-usage-metrics/lines-of-code-metrics)
70. [GitHub Copilot usage metrics - GitHub Docs](https://docs.github.com/en/copilot/concepts/copilot-usage-metrics/copilot-metrics)
71. [About storage of your data with data residency - GitHub Enterprise Cloud Docs](https://docs.github.com/en/enterprise-cloud@latest/admin/data-residency/about-storage-of-your-data-with-data-residency)
72. [GitHub Enterprise Data Residency, EMU, and Organization Design](https://www.memobog.net/en/blog/2026-07-23-github-enterprise-data-residency-emu/)
73. [2025 DORA State of AI-assisted Software Development report](https://cloud.google.com/devops/state-of-devops/?hl=ja)
74. [GitHub Copilot support for data security, privacy, and legal protection · community · Discussion #196578 · GitHub](https://github.com/orgs/community/discussions/196578)
75. [AWS named as a Leader in the 2025 Gartner Magic Quadrant for AI Code Assistants](https://aws.amazon.com/blogs/devops/aws-named-as-a-leader-in-the-2025-gartner-magic-quadrant-for-ai-code-assistants/)
76. [2025 DORA Report: State of AI-assisted Software Development](https://businessdatasolutions.github.io/ai-wiki/sources/2025-09-23-dora-2025-state-of-ai-assisted-software-development)
77. [Google CEO says 75% of company’s new code is AI-generated](https://www.semafor.com/article/04/24/2026/google-ceo-says-75-of-companys-new-code-is-ai-generated)
