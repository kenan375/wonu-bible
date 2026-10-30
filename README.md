# 원어서재

개역개정과 히브리어·헬라어 원문을 나란히 읽고, 단어를 눌러 문법·사전·용례(컨코던스)를 보고, 노트를 옵시디언 말씀서재용 마크다운으로 내보내는 개인용 원어 성경 웹앱(PWA)입니다.

- 앱 주소: https://kenan375.github.io/wonu-bible/
- 안드로이드 크롬에서 열고 메뉴 ⋮ → **홈 화면에 추가(앱 설치)**

## 한글 본문
이 저장소에는 한글 성경 본문이 들어 있지 않습니다. 사용자가 자기 기기에서 갖고 있는 성경 파일(.bdb, SQLite)을 앱 설정에서 불러오면 그 기기의 브라우저 저장소에만 보관됩니다.

## 원어 데이터 출처
히브리어 구약(TAHOT), 헬라어 신약(TAGNT), 스트롱 사전(TBESH·TBESG), 문법 코드(TEHMC·TEGMC):
**STEPBible.org — Tyndale House, Cambridge**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
https://github.com/STEPBible/STEPBible-Data

앱용 JSON으로 바꾸면서 형식을 바꾸고 문법 설명을 한국어로 옮겼습니다.

관주(약 43만 개, 추천 수 순): **OpenBible.info** Cross References, [CC BY](https://creativecommons.org/licenses/by/4.0/) (scrollmapper/bible_databases 경유).

영어 성경: **KJV** (퍼블릭 도메인).

SQLite 읽기: [sql.js](https://github.com/sql-js/sql.js) (MIT).
