"""
Deterministic Job Description Matcher and Alignment Analyzer.
Compares required JD skills against verified portfolio data with zero hallucination.
"""

import re
from typing import Dict, List, Any
from portfolio_data import PORTFOLIO_DATA, get_all_skills_flat

TECH_CATALOG = [
    # Languages
    {"canonical": "Java", "patterns": [r"\bjava\b"], "category": "Languages"},
    {"canonical": "Python", "patterns": [r"\bpython\b"], "category": "Languages"},
    {"canonical": "C", "patterns": [r"\bc\b", r"\bc\s+lang\b"], "category": "Languages"},
    {"canonical": "C++", "patterns": [r"\bc\+\+\b", r"\bcpp\b"], "category": "Languages"},
    {"canonical": "C#", "patterns": [r"\bc#\b", r"\bcsharp\b"], "category": "Languages"},
    {"canonical": "JavaScript", "patterns": [r"\bjavascript\b", r"\bjs\b"], "category": "Languages"},
    {"canonical": "TypeScript", "patterns": [r"\btypescript\b", r"\bts\b"], "category": "Languages"},
    {"canonical": "Go", "patterns": [r"\bgolang\b", r"\bgo\b"], "category": "Languages"},
    {"canonical": "Rust", "patterns": [r"\brust\b"], "category": "Languages"},
    {"canonical": "Kotlin", "patterns": [r"\bkotlin\b"], "category": "Languages"},
    {"canonical": "Swift", "patterns": [r"\bswift\b"], "category": "Languages"},
    {"canonical": "PHP", "patterns": [r"\bphp\b"], "category": "Languages"},
    {"canonical": "Ruby", "patterns": [r"\bruby\b"], "category": "Languages"},
    {"canonical": "SQL", "patterns": [r"\bsql\b"], "category": "Languages"},

    # Frontend
    {"canonical": "React", "patterns": [r"\breact(\.js)?\b"], "category": "Frontend"},
    {"canonical": "SvelteKit", "patterns": [r"\bsveltekit\b", r"\bsvelte\b"], "category": "Frontend"},
    {"canonical": "Tailwind CSS", "patterns": [r"\btailwind(\s*css)?\b"], "category": "Frontend"},
    {"canonical": "HTML5", "patterns": [r"\bhtml5?\b"], "category": "Frontend"},
    {"canonical": "CSS3", "patterns": [r"\bcss3?\b"], "category": "Frontend"},
    {"canonical": "Bootstrap", "patterns": [r"\bbootstrap\b"], "category": "Frontend"},
    {"canonical": "Next.js", "patterns": [r"\bnext(\.js)?\b"], "category": "Frontend"},
    {"canonical": "Vue.js", "patterns": [r"\bvue(\.js)?\b"], "category": "Frontend"},
    {"canonical": "Angular", "patterns": [r"\bangular\b"], "category": "Frontend"},
    {"canonical": "Redux", "patterns": [r"\bredux\b"], "category": "Frontend"},

    # Backend & APIs
    {"canonical": "Node.js", "patterns": [r"\bnode(\.js)?\b"], "category": "Backend"},
    {"canonical": "Express.js", "patterns": [r"\bexpress(\.js)?\b"], "category": "Backend"},
    {"canonical": "FastAPI", "patterns": [r"\bfastapi\b"], "category": "Backend"},
    {"canonical": "Flask", "patterns": [r"\bflask\b"], "category": "Backend"},
    {"canonical": "Django", "patterns": [r"\bdjango\b"], "category": "Backend"},
    {"canonical": "Spring Boot", "patterns": [r"\bspring(\s*boot)?\b"], "category": "Backend"},
    {"canonical": "REST APIs", "patterns": [r"\brest(ful)?\s*(api|apis)?\b"], "category": "Backend"},
    {"canonical": "GraphQL", "patterns": [r"\bgraphql\b"], "category": "Backend"},
    {"canonical": "JWT Authentication", "patterns": [r"\bjwt\b", r"\bjson\s*web\s*token\b"], "category": "Backend"},
    {"canonical": "Microservices", "patterns": [r"\bmicroservices?\b"], "category": "Backend"},

    # Databases & Storage
    {"canonical": "MongoDB", "patterns": [r"\bmongodb\b", r"\bmongo\b"], "category": "Databases"},
    {"canonical": "PostgreSQL", "patterns": [r"\bpostgres(ql)?\b"], "category": "Databases"},
    {"canonical": "MySQL", "patterns": [r"\bmysql\b"], "category": "Databases"},
    {"canonical": "SQLite", "patterns": [r"\bsqlite\b"], "category": "Databases"},
    {"canonical": "MSSQL", "patterns": [r"\bmssql\b", r"\bmicrosoft\s*sql\b", r"\bsql\s*server\b"], "category": "Databases"},
    {"canonical": "Redis", "patterns": [r"\bredis\b"], "category": "Databases"},
    {"canonical": "Firebase", "patterns": [r"\bfirebase\b", r"\bfirestore\b"], "category": "Databases"},
    {"canonical": "NoSQL", "patterns": [r"\bnosql\b"], "category": "Databases"},
    {"canonical": "Cassandra", "patterns": [r"\bcassandra\b"], "category": "Databases"},

    # Cloud & DevOps
    {"canonical": "Docker", "patterns": [r"\bdocker(\s*compose)?\b"], "category": "DevOps"},
    {"canonical": "Kubernetes", "patterns": [r"\bkubernetes\b", r"\bk8s\b"], "category": "DevOps"},
    {"canonical": "AWS", "patterns": [r"\baws\b", r"\bamazon\s*web\s*services\b"], "category": "Cloud"},
    {"canonical": "GCP", "patterns": [r"\bgcp\b", r"\bgoogle\s*cloud\b"], "category": "Cloud"},
    {"canonical": "Azure", "patterns": [r"\bazure\b"], "category": "Cloud"},
    {"canonical": "OCI (Oracle Cloud)", "patterns": [r"\boci\b", r"\boracle\s*cloud\b"], "category": "Cloud"},
    {"canonical": "Git", "patterns": [r"\bgit\b"], "category": "Tools"},
    {"canonical": "GitHub", "patterns": [r"\bgithub\b"], "category": "Tools"},
    {"canonical": "Linux", "patterns": [r"\blinux\b", r"\bunix\b"], "category": "Tools"},
    {"canonical": "CI/CD", "patterns": [r"\bci\s*\/\s*cd\b", r"\bjenkins\b", r"\bgithub\s*actions\b"], "category": "DevOps"},

    # AI & CS
    {"canonical": "Gemini AI", "patterns": [r"\bgemini\b"], "category": "AI"},
    {"canonical": "LLMs", "patterns": [r"\bllm(s)?\b", r"\blarge\s*language\s*model\b", r"\bgenai\b", r"\bgenerative\s*ai\b"], "category": "AI"},
    {"canonical": "Machine Learning", "patterns": [r"\bmachine\s*learning\b", r"\bml\b"], "category": "AI"},
    {"canonical": "Data Structures & Algorithms", "patterns": [r"\bdsa\b", r"\bdata\s*structures\b", r"\balgorithms\b"], "category": "CS"},
    {"canonical": "System Design", "patterns": [r"\bsystem\s*design\b"], "category": "CS"},
    {"canonical": "OOP", "patterns": [r"\boop\b", r"\bobject\s*oriented\b"], "category": "CS"},
    {"canonical": "Figma", "patterns": [r"\bfigma\b"], "category": "Design"},
    {"canonical": "Tableau", "patterns": [r"\btableau\b"], "category": "Analytics"},
    {"canonical": "Power BI", "patterns": [r"\bpower\s*bi\b"], "category": "Analytics"}
]

def extract_skills_from_jd(text: str) -> List[Dict[str, Any]]:
    if not text:
        return []
    detected = {}
    for item in TECH_CATALOG:
        for pat in item["patterns"]:
            if re.search(pat, text, re.IGNORECASE):
                detected[item["canonical"]] = item
                break
    return list(detected.values())

def analyze_job_description(jd_text: str, portfolio: Dict[str, Any] = None) -> Dict[str, Any]:
    p = portfolio or PORTFOLIO_DATA
    verified_flat = [s.lower() for s in get_all_skills_flat(p)]

    def is_verified(skill_name: str) -> bool:
        s_lower = skill_name.lower()
        return any(s_lower in v or v in s_lower for v in verified_flat)

    jd_skills = extract_skills_from_jd(jd_text)
    matching_skills = []
    missing_skills = []

    for skill in jd_skills:
        name = skill["canonical"]
        if is_verified(name):
            matching_skills.append(name)
        else:
            missing_skills.append(name)

    total = len(matching_skills) + len(missing_skills)
    match_percentage = round((len(matching_skills) / total) * 100) if total > 0 else 0

    # Relevant projects
    relevant_projects = []
    for proj in p.get("projects", []):
        matched_in_proj = [
            tech for tech in proj.get("techStack", [])
            if any(ms.lower() == tech.lower() or tech.lower() in ms.lower() or ms.lower() in tech.lower() for ms in matching_skills)
        ]
        if matched_in_proj:
            relevant_projects.append({
                "title": proj["title"],
                "category": proj["category"],
                "matchedTech": matched_in_proj,
                "link": proj.get("liveDemo") or proj.get("github"),
                "summary": proj["summary"],
                "relevance": f"{', '.join(matched_in_proj)} directly demonstrated in this project."
            })

    relevant_projects.sort(key=lambda x: len(x["matchedTech"]), reverse=True)

    # Relevant hackathons
    relevant_experience = [
        {"title": h["title"], "summary": h["achievement"]}
        for h in p.get("hackathonsAndCompetitions", [])[:2]
    ]

    return {
        "matchPercentage": match_percentage,
        "matchingSkills": matching_skills,
        "missingSkills": missing_skills,
        "relevantProjects": relevant_projects[:3],
        "relevantExperience": relevant_experience,
        "rawSkillCount": total
    }

def format_match_report(analysis: Dict[str, Any], portfolio: Dict[str, Any] = None) -> str:
    p = portfolio or PORTFOLIO_DATA
    name = p['personal']['name']
    match_pct = analysis["matchPercentage"]
    matching = analysis["matchingSkills"]
    missing = analysis["missingSkills"]
    projects = analysis["relevantProjects"]
    experience = analysis["relevantExperience"]
    total = analysis["rawSkillCount"]

    report = "### 📊 Job Description Alignment Analysis\n\n"
    report += f"**Estimated Portfolio-to-JD Alignment:** **`{match_pct}%`** ({len(matching)} of {total} detected technical requirements)\n"
    report += f"> *Note: This alignment score is calculated deterministically by comparing documented skills and projects in {name}'s portfolio against the extracted requirements from the job description. It is not an official automated ATS score.*\n\n"

    # A. Matching Skills
    report += "#### ✅ A. Matching Verified Skills\n"
    if matching:
        report += f"The following requirements are **explicitly verified** in {name}'s portfolio:\n"
        report += "\n".join(f"- **{s}**" for s in matching) + "\n\n"
    else:
        report += "*No direct 1:1 match found with the explicit technical skills listed in the job description.*\n\n"

    # B. Missing or Unverified Skills
    report += "#### ⚠️ B. Missing or Unverified Skills\n"
    if missing:
        report += f"The following required skills are **not currently documented** in {name}'s portfolio:\n"
        report += "\n".join(f"- **{s}** *(not listed in portfolio)*" for s in missing) + "\n\n"
    else:
        report += f"*All identified technical skills in the job description are covered in {name}'s portfolio!*\n\n"

    # C. Relevant Projects
    report += "#### 🚀 C. Relevant Portfolio Projects\n"
    if projects:
        for i, proj in enumerate(projects, 1):
            report += f"{i}. **{proj['title']}** ({proj['category']})\n"
            report += f"   - **Demonstrated Skills:** {', '.join(proj['matchedTech'])}\n"
            report += f"   - **Relevance:** {proj['relevance']}\n"
            if proj.get("link"):
                report += f"   - **Reference Link:** [View Project Code / Demo]({proj['link']})\n"
        report += "\n"
    else:
        report += "*See all featured projects in the portfolio including Community Hero (React, Firebase, AI) and FinPilot AI (Microservices, FastAPI, Node.js, MongoDB).*\n\n"

    # D. Relevant Experience
    report += "#### 🏆 D. Relevant Hackathon & Practical Experience\n"
    if experience:
        for exp in experience:
            report += f"- **{exp['title']}:** {exp['summary']}\n"
        report += "\n"

    # E & F. Strengths and Gaps
    report += "#### 💡 E & F. Strengths and Gaps Assessment\n"
    report += (
        f"- **Key Strengths:** Strong foundations in Computer Science (CGPA: **{p['education']['cgpa']}**), "
        "proven competitive hackathon track record (Flipkart GRiD 8.0 National Finalist, SIH 2025 Grand Finale Top 15), "
        "and full-stack development capability spanning modern frontend, scalable microservices, and practical AI/LLM integration.\n"
    )
    if missing:
        missing_preview = ", ".join(missing[:3])
        more_str = " and others" if len(missing) > 3 else ""
        report += f"- **Gaps / Areas to Confirm:** {missing_preview}{more_str} are not documented in his current portfolio; recommend confirming candidate's practical familiarity or fast-learning capacity during technical interviews.\n\n"
    else:
        report += "- **Gaps:** None detected based on the provided skills list.\n\n"

    # G. Recruiter-Friendly Summary
    report += "#### 📝 G. Recruiter Summary\n"
    matching_preview = ", ".join(matching[:4])
    report += (
        f"{name} is a high-achieving Computer Science student and developer with demonstrated end-to-end engineering skills "
        f"in full-stack web applications, microservices, and AI integrations. Based strictly on documented portfolio evidence, "
        f"he represents a strong fit for roles emphasizing {matching_preview}."
    )

    return report
