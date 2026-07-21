# physics_demo_sim

고등학교 물리 수업(물리학I)용 인터랙티브 시뮬레이션과 실험 분석 도구 모음입니다.
모두 설치 없이 브라우저에서 실행되며 스마트폰에 대응합니다.

## 🌐 바로 사용하기

배포하면 아래 주소로 접속합니다. 둘 중 하나만 설정해도 되고, 둘 다 써도 됩니다.

- **Vercel**: `https://physics-demo-sim.vercel.app` (저장소 import 후 자동 배포)
- **GitHub Pages**: `https://hs2sks.github.io/physics_demo_sim/`

### Vercel 연동 (권장 — push할 때마다 자동 반영)

1. https://vercel.com 에 GitHub 계정으로 로그인
2. **Add New… → Project → Import Git Repository → `physics_demo_sim`**
3. Framework Preset은 **Other**(정적 사이트), 설정은 기본값 그대로 **Deploy**
4. 이후 `main`에 push하면 Vercel이 자동으로 다시 배포합니다.

> 이 저장소에는 정적 사이트용 `vercel.json`이 포함되어 있어 별도 빌드 설정이 필요 없습니다.

### GitHub Pages (대안)

저장소 **Settings → Pages** → Source **Deploy from a branch** → Branch **main / (root)** → Save

## 구성

```
index.html                     ← 전체 시뮬레이션 목록 (랜딩 페이지)
mechanics/                     역학
├── gravity/                   중력가속도(g) 측정
│   ├── free-fall/             🍎 자유낙하        ✔ 완료
│   ├── pendulum/              🕰 단진자          ✔ 완료
│   ├── inclined-plane/        📐 빗면            준비 중
│   └── spring/                🌀 용수철 진자      준비 중
└── black-ice/                 🧊 블랙아이스(마찰·제동 R&E 실험실)  ✔ 완료
electromagnetism/              전자기            준비 중
optics/                        광학              준비 중
modern-physics/                현대물리
└── photoelectric-effect/      💡 광전효과        ✔ 완료
tools/                         분석 도구
└── stroboscope/              📸 스트로보스코프(운동 영상 분석)  ✔ 완료
```

각 폴더에는 시뮬레이션(`index.html`)과 기획 문서(`PRD.md`)가 함께 있습니다.

## 공통 특징

- 매개변수 조절 UI · 실시간 그래프 · 측정 기록 · CSV 저장
- 수동 측정(반응 시간 오차 체험) vs 자동 측정 비교
- 교사 시연용 큰 글씨 모드 / 학생 개별 탐구 / 수행평가(미지 행성 X) 겸용
- 실제 실험(학교 건물·교실) 보조 기능 내장
