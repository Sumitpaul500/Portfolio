"""
Bounded ReAct (Reasoning + Acting) Agent for Sumit Paul's AI Recruiter Chatbot.
Provides structured, evidence-grounded multi-step reasoning with strict execution limits.
"""

import re
from typing import Dict, List, Any, Optional
from portfolio_data import PORTFOLIO_DATA, get_all_skills_flat
from jd_matcher import analyze_job_description, format_match_report

# Safety guardrails against prompt injection
PROMPT_INJECTION_PATTERNS = [
    re.compile(r'ignore\s+(all\s+)?(previous\s+|prior\s+)?instructions', re.IGNORECASE),
    re.compile(r'you\s+are\s+now\s+(a|an|in)\s+', re.IGNORECASE),
    re.compile(r'system\s+prompt', re.IGNORECASE),
    re.compile(r'reveal\s+(api\s+)?(key|secret|password)', re.IGNORECASE),
    re.compile(r'bypass\s+security', re.IGNORECASE),
    re.compile(r'jailbreak', re.IGNORECASE)
]

def check_prompt_injection(text: str) -> bool:
    if not text:
        return False
    return any(p.search(text) for p in PROMPT_INJECTION_PATTERNS)

class ReActAgent:
    """
    A bounded ReAct agent with explicit tool permissions and max iteration limit.
    """
    def __init__(self, portfolio: Dict[str, Any] = None):
        self.portfolio = portfolio or PORTFOLIO_DATA
        self.max_iterations = 3

    # ─── Bounded Safe Tools ──────────────────────────────────────────────
    def tool_portfolio_search(self, query: str) -> str:
        """Searches portfolio sections for matching skills, projects, or background."""
        q = query.lower()
        results = []
        p = self.portfolio

        # Search skills
        matched_skills = []
        for cat, skills in p.get("skills", {}).items():
            if isinstance(skills, list):
                for s in skills:
                    if q in s.lower() or s.lower() in q:
                        matched_skills.append(s)
        if matched_skills:
            results.append(f"Matching Skills: {', '.join(matched_skills)}")

        # Search projects
        for proj in p.get("projects", []):
            proj_title = proj.get("title", "").lower()
            proj_tech = " ".join(proj.get("techStack", [])).lower()
            if q in proj_title or q in proj_tech:
                results.append(f"Project: {proj.get('title')} | Tech: {', '.join(proj.get('techStack', []))} | Link: {proj.get('liveDemo') or proj.get('github')}")

        # Search hackathons
        for h in p.get("hackathonsAndCompetitions", []):
            if q in h.get("title", "").lower() or q in h.get("achievement", "").lower():
                results.append(f"Hackathon: {h.get('title')} - {h.get('achievement')}")

        return "\n".join(results) if results else "No specific direct match found in portfolio."

    def tool_job_alignment(self, jd_text: str) -> Dict[str, Any]:
        """Analyzes a job description against verified portfolio skills."""
        return analyze_job_description(jd_text, self.portfolio)

    def tool_verified_facts(self, topic: str) -> str:
        """Returns exact, verified facts for core personal and academic metrics."""
        t = topic.lower()
        p = self.portfolio
        if "cgpa" in t or "grade" in t or "score" in t:
            return f"Exact CGPA: {p['education']['cgpa']} / 10.0 (New Horizon College of Engineering, VTU)"
        if "college" in t or "education" in t or "university" in t:
            return f"Education: {p['education']['degree']} in {p['education']['branch']} ({p['education']['duration']}) at {p['education']['institution']}, affiliated to {p['education']['affiliation']}."
        if "github" in t:
            return f"GitHub: {p['personal']['github']}"
        if "linkedin" in t:
            return f"LinkedIn: {p['personal']['linkedin']}"
        if "resume" in t or "cv" in t:
            return f"Resume: {p['personal']['resumeUrl']}"
        if "contact" in t or "email" in t or "phone" in t:
            return f"Email: {p['personal']['email']} | Phone: {p['personal']['phoneFormatted']} | Location: {p['personal']['location']}"
        return f"Sumit Paul: {p['personal']['headline']}"

    # ─── Bounded ReAct Execution Loop ─────────────────────────────────────
    def execute(self, user_query: str, jd_text: str = "") -> Dict[str, Any]:
        # 1. Prompt Injection Guard
        if check_prompt_injection(user_query) or check_prompt_injection(jd_text):
            return {
                "thought": "Detected potential prompt injection attempt.",
                "action": "reject_unsafe_input",
                "final_answer": "I am Sumit Paul's AI Recruiter Assistant, strictly grounded in verified portfolio information. I cannot alter system instructions, reveal internal keys, or execute unauthorized commands. How can I assist you with Sumit's qualifications?",
                "iterations": 1
            }

        # 2. ReAct Plan for Job Description Matching
        if jd_text and len(jd_text.strip()) > 20:
            analysis = self.tool_job_alignment(jd_text)
            report = format_match_report(analysis, self.portfolio)
            return {
                "thought": "Recruiter provided a job description. Need to extract required skills and compare against portfolio evidence.",
                "action": "tool_job_alignment",
                "final_answer": report,
                "analysis": analysis,
                "iterations": 1
            }

        # 3. ReAct Plan for Fact Queries
        q_lower = user_query.lower()
        for fact_key in ['cgpa', 'gpa', 'college', 'education', 'university', 'github', 'linkedin', 'resume', 'contact', 'email', 'phone']:
            if fact_key in q_lower:
                fact_val = self.tool_verified_facts(fact_key)
                return {
                    "thought": f"Query specifically asks for verified fact: {fact_key}",
                    "action": "tool_verified_facts",
                    "final_answer": fact_val,
                    "iterations": 1
                }

        # 4. ReAct Search for Projects / Tech
        search_res = self.tool_portfolio_search(user_query)
        return {
            "thought": "General technical query. Search portfolio database for relevant experience.",
            "action": "tool_portfolio_search",
            "observation": search_res,
            "final_answer": search_res if search_res != "No specific direct match found in portfolio." else None,
            "iterations": 1
        }

