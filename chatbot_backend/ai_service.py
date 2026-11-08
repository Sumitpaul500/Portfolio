"""
Core AI service in Python for Sumit Paul's recruiter chatbot.
Supports Google Gemini, OpenAI, and a reliable zero-hallucination deterministic grounding engine.
"""

import os
import re
import time
import requests
from typing import Dict, List, Any, Tuple
from portfolio_data import PORTFOLIO_DATA, get_synchronized_portfolio, build_system_prompt
from jd_matcher import analyze_job_description, format_match_report

# In-memory rate limiting: max 30 requests per IP per minute
_RATE_LIMIT_MAP: Dict[str, Dict[str, Any]] = {}
RATE_LIMIT_WINDOW = 60  # seconds
MAX_REQUESTS_PER_WINDOW = 30

def check_rate_limit(client_ip: str = "unknown") -> Tuple[bool, int]:
    now = time.time()
    entry = _RATE_LIMIT_MAP.get(client_ip)

    if not entry or now - entry["start_time"] > RATE_LIMIT_WINDOW:
        _RATE_LIMIT_MAP[client_ip] = {"count": 1, "start_time": now}
        return True, 0

    if entry["count"] >= MAX_REQUESTS_PER_WINDOW:
        retry_after = int(entry["start_time"] + RATE_LIMIT_WINDOW - now) + 1
        return False, max(1, retry_after)

    entry["count"] += 1
    return True, 0

def sanitize_user_input(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', str(text))
    return cleaned.strip()

def call_gemini(api_key: str, system_prompt: str, history: List[Dict[str, str]], user_message: str) -> str:
    model = "gemini-1.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    contents = []
    if isinstance(history, list):
        for msg in history[-8:]:
            role = "user" if msg.get("role") == "user" else "model"
            content_text = sanitize_user_input(msg.get("content", ""))
            if content_text:
                contents.append({
                    "role": role,
                    "parts": [{"text": content_text}]
                })

    contents.append({
        "role": "user",
        "parts": [{"text": user_message}]
    })

    payload = {
        "system_instruction": {
            "parts": [{"text": system_prompt}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "maxOutputTokens": 1000
        }
    }

    resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=25)
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini API error ({resp.status_code}): {resp.text}")

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini API returned no candidates.")
    
    parts = candidates[0].get("content", {}).get("parts", [])
    if not parts or not parts[0].get("text"):
        raise RuntimeError("Gemini API returned empty text.")

    return parts[0]["text"].strip()

def call_openai(api_key: str, system_prompt: str, history: List[Dict[str, str]], user_message: str) -> str:
    url = "https://api.openai.com/v1/chat/completions"
    messages = [{"role": "system", "content": system_prompt}]

    if isinstance(history, list):
        for msg in history[-8:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            content_text = sanitize_user_input(msg.get("content", ""))
            if content_text:
                messages.append({"role": role, "content": content_text})

    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 1000
    }

    resp = requests.post(url, json=payload, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }, timeout=25)

    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI API error ({resp.status_code}): {resp.text}")

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("OpenAI API returned no choices.")

    text = choices[0].get("message", {}).get("content", "")
    return text.strip()

def call_groq(api_key: str, system_prompt: str, history: List[Dict[str, str]], user_message: str) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"
    messages = [{"role": "system", "content": system_prompt}]

    if isinstance(history, list):
        for msg in history[-8:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            content_text = sanitize_user_input(msg.get("content", ""))
            if content_text:
                messages.append({"role": role, "content": content_text})

    messages.append({"role": "user", "content": user_message})

    models_to_try = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"]
    last_err = None

    for model in models_to_try:
        try:
            resp = requests.post(url, headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }, json={
                "model": model,
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": 1000
            }, timeout=20)

            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "").strip()
            else:
                last_err = f"Groq {model} ({resp.status_code}): {resp.text}"
        except Exception as e:
            last_err = str(e)

    raise RuntimeError(last_err or "Groq API returned an empty response.")

def deterministic_grounding_engine(user_message: str, portfolio: Dict[str, Any] = None, history: List[Dict[str, str]] = None) -> str:
    q = user_message.lower().strip()
    p = portfolio or PORTFOLIO_DATA
    name = p['personal']['name']

    # 1. CGPA & Academic
    if any(k in q for k in ['cgpa', 'gpa', 'marks', 'grade', 'percentage', 'academic']):
        return (
            f"**{name}'s CGPA is {p['education']['cgpa']} / 10.0** in {p['education']['degree']} "
            f"({p['education']['branch']}) at {p['education']['institution']}, affiliated to {p['education']['affiliation']}, "
            f"Bangalore (2023–2027). He has maintained consistent academic distinction while actively competing in national hackathons "
            f"and building production software."
        )

    # 2. Education & College
    if any(k in q for k in ['college', 'education', 'university', 'degree', 'study', 'school']):
        coursework = " • ".join(p['education']['relevantCoursework'])
        return (
            f"**Education Details for {name}:**\n"
            f"- **Degree:** {p['education']['degree']} in {p['education']['branch']}\n"
            f"- **Institution:** {p['education']['institution']}, Bangalore\n"
            f"- **Affiliation:** {p['education']['affiliation']}\n"
            f"- **Duration:** {p['education']['duration']}\n"
            f"- **CGPA:** **{p['education']['cgpa']} / 10.0**\n"
            f"- **Core Coursework:** {coursework}"
        )

    # 3. Technical Skills
    if any(k in q for k in ['skill', 'technolog', 'stack', 'languages', 'framework']):
        return (
            f"Here are **{name}'s verified technical skills** from his portfolio:\n\n"
            f"- **Programming Languages:** {', '.join(p['skills']['languagesAndCore'][:5])}\n"
            f"- **Frontend:** {', '.join(p['skills']['frontend'])}\n"
            f"- **Backend & APIs:** {', '.join(p['skills']['backend'])}\n"
            f"- **Databases & Storage:** {', '.join(p['skills']['databasesAndStorage'])}\n"
            f"- **DevOps & Tools:** {', '.join(p['skills']['developerToolsAndCloud'])}\n"
            f"- **AI & LLM Integration:** {', '.join(p['skills']['aiAndLLMs'])}\n"
            f"- **Core CS:** Data Structures & Algorithms, OOP, System Design, Cryptography\n\n"
            f"Would you like to know how he applied any of these technologies in his projects?"
        )

    # 3b. Follow-up to "Would you like to know how he applied any of these technologies in his projects?"
    is_affirmative = q in ['yes', 'yes please', 'sure', 'yeah', 'yep', 'tell me', 'tell me more'] or \
        q.startswith('yes ') or any(k in q for k in ['how he applied', 'how did he apply', 'how are they applied', 'how does he use', 'how did he use', 'in his projects', 'applied in projects'])

    if is_affirmative:
        return (
            f"Here is **how {name} applied these technologies across his production projects**:\n\n"
            f"- 🚀 **Gemini AI, Leaflet & Firebase:** In **[Community Hero](https://community-hero-47e90.web.app/)**\n"
            f"  • Integrated Gemini AI for automated civic-issue categorization.\n"
            f"  • Built interactive Leaflet geospatial map with geohashing for hotspot prediction.\n"
            f"  • Architected real-time Firestore database with role-based access control (RBAC 3+ roles).\n\n"
            f"- ⚡ **Docker, FastAPI, Groq LLM & Redis:** In **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)**\n"
            f"  • Containerized 3-tier microservices stack with Docker Compose (FastAPI + Node.js + SvelteKit).\n"
            f"  • Deployed OCR + Groq LLM (Llama 3.3-70B) pipeline parsing 50+ receipt formats (>95% accuracy).\n"
            f"  • Implemented Redis caching for high-speed multi-currency calculations and financial health scoring.\n\n"
            f"- 🔒 **Java, LSB Steganography & AES-256:** In **[Image Steganography](https://github.com/Sumitpaul500)**\n"
            f"  • Engineered 1,277 lines of pure Java (Swing UI) without external libraries.\n"
            f"  • Concealed text and audio payloads across JPG/PNG/BMP with 99.2% payload capacity and AES-256/CBC encryption.\n\n"
            f"- 🏥 **Flask & REST APIs:** In **AyurSutra** (SIH 2025 Grand Finale Top 15)\n"
            f"  • Built Python Flask backend for patient scheduling, EHR integration, and automated therapy workflows.\n\n"
            f"You can inspect all source code on his [GitHub Profile](https://github.com/Sumitpaul500)."
        )

    # 4. Specific Technologies
    if any(k in q for k in ['docker', 'container']):
        return (
            f"Yes! **{name} has hands-on Docker and containerization experience:**\n"
            f"- In **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)**, he used **Docker and Docker Compose** to containerize a 3-tier microservices architecture (SvelteKit frontend, Node.js Express REST API, FastAPI AI service, MongoDB, and Redis).\n"
            f"- Engineered multi-container orchestration for reproducible development and local deployment."
        )

    if any(k in q for k in ['mongo', 'nosql']):
        return (
            f"Yes! **{name} uses MongoDB extensively:**\n"
            f"- Serves as the primary NoSQL datastore in **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)** for receipt metadata, transaction history, and multi-currency account data.\n"
            f"- Experienced with MongoDB Atlas, aggregation pipelines, schema modeling, and indexing."
        )

    if 'redis' in q:
        return (
            f"Yes! **{name} integrates Redis for high-speed caching:**\n"
            f"- Implemented in **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)** for caching financial exchange rates, user session state, and accelerating the real-time financial health scoring engine."
        )

    if 'fastapi' in q:
        return (
            f"Yes! **FastAPI is one of {name}'s go-to Python frameworks:**\n"
            f"- Built the high-performance AI inference and OCR extraction microservice in **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)** using FastAPI.\n"
            f"- Also powers the backend of this portfolio's AI Recruiter Chatbot with Pydantic schemas and ReAct agent architecture."
        )

    if any(k in q for k in ['firebase', 'firestore']):
        return (
            f"Yes! **{name} built and deployed with Firebase:**\n"
            f"- Architected **[Community Hero](https://community-hero-47e90.web.app/)** with Cloud Firestore, fine-grained Role-Based Access Control (RBAC 3+ roles), Cloud Functions, and Firebase Hosting supporting 1,000+ concurrent users."
        )

    if any(k in q for k in ['gemini', 'groq', 'llm', 'ocr']):
        return (
            f"Yes! **{name} has practical, production LLM integration skills:**\n"
            f"- **Gemini AI:** Integrated into **[Community Hero](https://community-hero-47e90.web.app/)** for automated civic-issue categorization.\n"
            f"- **Groq LLM (Llama 3.3-70B) & OCR.Space:** Implemented in **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)** for extracting structured receipt data from 50+ formats (>95% accuracy).\n"
            f"- **Oracle Cloud OCI Certified Generative AI Professional (2025)**."
        )

    if any(k in q for k in ['steganograph', 'crypto', 'aes', 'security']):
        return (
            f"Yes! **{name} implemented cybersecurity algorithms in Java:**\n"
            f"- Built an **[Image Steganography Application](https://github.com/Sumitpaul500)** in 1,277 lines of pure Java (no third-party dependencies).\n"
            f"- Combines LSB steganography (99.2% capacity concealment in JPG/PNG/BMP) with military-grade AES-256/CBC encryption and SHA-256 password hashing."
        )

    if any(k in q for k in ['leaflet', 'map', 'geohash']):
        return (
            f"Yes! **{name} has geospatial engineering experience:**\n"
            f"- Built interactive Leaflet mapping in **[Community Hero](https://community-hero-47e90.web.app/)** with geo-tagged civic issue reporting and a predictive hotspot engine using geohashing."
        )

    if 'python' in q:
        return (
            f"Yes! **{name} is highly proficient in Python.** He has used Python for:\n"
            f"- **FastAPI Microservices:** Built high-performance backend microservices in **FinPilot AI** for expense processing.\n"
            f"- **Flask & Automation Backend:** Developed the core backend for **AyurSutra** at Smart India Hackathon 2025 "
            f"(SIH Grand Finale Top 15), featuring automated therapy workflows and EHR integration.\n"
            f"- **AI/LLM integrations:** Python-based AI workflows and prompt engineering with Groq and Gemini models."
        )

    if 'java' in q and 'script' not in q:
        return (
            f"Yes! **Java is one of {name}'s primary core languages.**\n"
            f"- Engineered a **1,277-line native Java Swing application** ([Image Steganography]({p['personal']['github']})) "
            f"implementing LSB steganography, AES-256 encryption, and SHA-256 password hashing without third-party libraries.\n"
            f"- Certified in **Data Structures and Algorithms with Java (Alpha)** from Apna College.\n"
            f"- Strong foundations in Java Object-Oriented Programming (OOP) and algorithms."
        )

    if 'react' in q:
        return (
            f"Yes! **{name} has strong hands-on React experience:**\n"
            f"- Developed and deployed **[Community Hero]({p['projects'][0]['liveDemo']})** — an AI-powered civic platform "
            f"supporting 1,000+ concurrent users with React, TypeScript, Leaflet maps, and Firebase.\n"
            f"- Frontend for **AyurSutra** at Smart India Hackathon 2025 Grand Finale.\n"
            f"- Experienced with modern hooks, state management, component architecture, and responsive Tailwind CSS."
        )

    # 5. Projects
    if any(k in q for k in ['project', 'built', 'work', 'app', 'application']):
        p1 = p['projects'][0]
        p2 = p['projects'][1]
        p3 = p['projects'][2]
        p4 = p['projects'][3]
        return (
            f"Here are **{name}'s featured engineering projects**:\n\n"
            f"1. **[{p1['title']}]({p1['liveDemo']})**\n"
            f"   - **Tech:** {', '.join(p1['techStack'])}\n"
            f"   - **Impact:** Supports 1,000+ concurrent users with Gemini AI categorization, Leaflet mapping, and citizen gamification. ([Live Demo]({p1['liveDemo']}) | [GitHub]({p1['github']}))\n\n"
            f"2. **[{p2['title']}]({p2['github']})**\n"
            f"   - **Tech:** {', '.join(p2['techStack'])}\n"
            f"   - **Impact:** 3-tier microservices platform parsing 50+ receipt formats (Groq Llama 3.3-70B OCR, 95%+ accuracy) and 15+ Indian bank SMS formats with Docker Compose and Redis.\n\n"
            f"3. **[{p3['title']}]({p3['github']})**\n"
            f"   - **Tech:** {', '.join(p3['techStack'])}\n"
            f"   - **Impact:** 1,277-line Java desktop app achieving 99.2% payload concealment across JPG/PNG/BMP with AES-256/CBC encryption without third-party dependencies.\n\n"
            f"4. **[{p4['title']}]({p4['github']})**\n"
            f"   - **Tech:** {', '.join(p4['techStack'])}\n"
            f"   - **Impact:** Geolocation-aware weather app with 40+ weather parameters and sub-2s load time."
        )

    # 6. Hackathons & Competitions
    if any(k in q for k in ['hackathon', 'competition', 'flipkart', 'sih', 'smart india', 'grid']):
        return (
            f"**{name}'s National Hackathon Achievements:**\n\n"
            f"1. 🏆 **Flipkart GRiD 8.0 (2026): National Finalist**\n"
            f"   - Selected from **~1.65–1.7 Lakh+ registrations across India**.\n"
            f"   - Ranked in **Top 48 nationally** and **Top 16 in the Software Development track**.\n"
            f"   - Advanced to the National Finals hackathon.\n\n"
            f"2. 🏆 **Smart India Hackathon 2025 (SIH 2025): Grand Finale Top 15**\n"
            f"   - Built backend architecture and Flask API for AyurSutra (AI patient scheduling & EHR platform).\n\n"
            f"3. 🚀 **Vibe2Ship Hackathon (Coding Ninjas × Google for Developers, 2026)**\n"
            f"   - Solo developed and deployed Community Hero using Firebase and Gemini AI."
        )

    # 7. Certifications
    if any(k in q for k in ['certification', 'certificate', 'oracle', 'badge']):
        return (
            f"**{name}'s Verified Professional Certifications:**\n\n"
            f"- 🏆 **Oracle Cloud Infrastructure 2025 Certified Generative AI Professional** (Oracle University)\n"
            f"- 🏆 **Oracle Cloud Infrastructure Foundations Associate** (Oracle University)\n"
            f"- 🏆 **Introduction to Networking and Cloud Computing** (Microsoft, 2024)\n"
            f"- 🏆 **Data Structures and Algorithms with Java (Alpha)** (Apna College)\n\n"
            f"You can verify his Oracle badges on his [LinkedIn Profile]({p['personal']['linkedin']})."
        )

    # 8. Why Hire
    if any(k in q for k in ['why should we hire', 'why hire', 'strength', 'fit', 'hire him']):
        return (
            f"**Why {name} is a compelling hire for your engineering team:**\n\n"
            f"1. **Proven High-Scale Problem Solver:** Flipkart GRiD 8.0 National Finalist (Top 16 in Software Dev out of 1.7 lakh participants) and SIH 2025 Grand Finale Top 15.\n"
            f"2. **Production Full-Stack & Microservices:** Hands-on experience building multi-tier distributed systems with React, SvelteKit, FastAPI, Node.js, Docker, MongoDB, and Redis.\n"
            f"3. **Practical AI & Cloud Competency:** Certified Oracle OCI GenAI Professional; implemented production LLM solutions with Gemini AI and Groq Llama 3.3-70B.\n"
            f"4. **Academic Excellence:** Outstanding **{p['education']['cgpa']} / 10.0 CGPA** in Computer Science at NHCE (VTU), reflecting strong work ethic and foundational knowledge.\n"
            f"5. **Ready to Deliver Value:** Open for Full-Stack, Backend, and Software Engineering internships and full-time roles."
        )

    # 9. Links & Contact
    if 'github' in q:
        return f"Here is **{name}'s GitHub profile:** [github.com/Sumitpaul500]({p['personal']['github']}). You can inspect source code for Community Hero, FinPilot AI, Image Steganography, and more!"

    if 'linkedin' in q:
        return f"Here is **{name}'s LinkedIn profile:** [linkedin.com/in/sumit-paul-28b5b0280]({p['personal']['linkedin']})."

    if any(k in q for k in ['resume', 'cv']):
        return f"You can view or download **{name}'s official resume** directly here: [Sumit_Paul_Resume.pdf]({p['personal']['resumeUrl']}) or via the 'View Resume' button on the portfolio."

    if any(k in q for k in ['contact', 'email', 'phone', 'reach']):
        return (
            f"You can reach **{name}** directly at:\n"
            f"- **Email:** [{p['personal']['email']}](mailto:{p['personal']['email']})\n"
            f"- **Phone:** [{p['personal']['phoneFormatted']}](tel:{p['personal']['phone'].replace(' ', '')})\n"
            f"- **LinkedIn:** [LinkedIn Profile]({p['personal']['linkedin']})\n"
            f"- **Location:** {p['personal']['location']}"
        )

    # General overview
    return (
        f"Hi! I am **{name}'s AI Portfolio Assistant**. I am grounded strictly in his verified portfolio.\n\n"
        f"Here is a quick snapshot:\n"
        f"- **Profile:** B.Tech CSE Student at NHCE Bangalore (VTU) with a **{p['education']['cgpa']} CGPA**.\n"
        f"- **Achievements:** Flipkart GRiD 8.0 National Finalist (Top 16 Software Dev) & SIH 2025 Grand Finale Top 15.\n"
        f"- **Core Tech:** Java, Python, React, SvelteKit, FastAPI, Node.js, MongoDB, Docker, Gemini AI.\n"
        f"- **Featured Projects:** [Community Hero]({p['projects'][0]['liveDemo']}), [FinPilot AI]({p['projects'][1]['github']}), and [Image Steganography]({p['projects'][2]['github']}).\n\n"
        f"Feel free to ask specific questions about his skills, projects, hackathons, or upload/paste a Job Description to check his alignment!"
    )

def process_chat_request(
    message: str = "",
    history: List[Dict[str, str]] = None,
    custom_skills: Dict[str, Any] = None,
    deleted_skills: List[str] = None,
    job_description_text: str = "",
    client_ip: str = "unknown"
) -> Dict[str, Any]:
    # 1. Rate Limiting Check
    allowed, retry_after = check_rate_limit(client_ip)
    if not allowed:
        return {
            "success": False,
            "error": f"Too many requests. Please wait {retry_after} seconds before sending another message."
        }

    # 2. Portfolio synchronization
    portfolio = get_synchronized_portfolio(custom_skills, deleted_skills)
    clean_message = sanitize_user_input(message)
    clean_jd = sanitize_user_input(job_description_text)

    # 3. Handle Job Description Upload / Matching
    if clean_jd and len(clean_jd) > 20:
        jd_analysis = analyze_job_description(clean_jd, portfolio)
        deterministic_report = format_match_report(jd_analysis, portfolio)

        groq_key = os.environ.get("GROQ_API_KEY")
        gemini_key = os.environ.get("GEMINI_API_KEY")
        openai_key = os.environ.get("OPENAI_API_KEY")

        if groq_key or gemini_key or openai_key:
            system_prompt = build_system_prompt(portfolio)
            user_inst = clean_message if clean_message else "Please analyze this job description against Sumit Paul's portfolio."
            matching_str = ', '.join(jd_analysis['matchingSkills']) if jd_analysis['matchingSkills'] else 'None'
            missing_str = ', '.join(jd_analysis['missingSkills']) if jd_analysis['missingSkills'] else 'None'
            jd_prompt = (
                f"A recruiter uploaded the following Job Description:\n<job_description>\n{clean_jd[:8000]}\n</job_description>\n\n"
                f"Here is the verified deterministic skill alignment data:\n"
                f"- Matching verified skills: {matching_str}\n"
                f"- Missing/unverified skills: {missing_str}\n"
                f"- Estimated Alignment Score: {jd_analysis['matchPercentage']}%\n\n"
                f"Please present a structured, professional, recruiter-friendly report covering:\n"
                f"A. Matching verified skills from Sumit's portfolio\n"
                f"B. Missing or unverified skills (do not invent qualifications)\n"
                f"C. Relevant projects and how they match the requirements (with links)\n"
                f"D. Relevant hackathons and practical experience\n"
                f"E. Transparent suitability assessment (cite the {jd_analysis['matchPercentage']}% estimated alignment score as an indicative portfolio-to-JD match, not an official ATS score)\n"
                f"F. Strengths and gaps\n"
                f"G. Recruiter summary\n"
                f"CRITICAL PRESENTATION REQUIREMENT: Do NOT output wide multi-column markdown tables. Format the report using clear section titles (###), bullet points, bold highlights, and clean spacing so it is effortless to read in a chat bubble.\n"
                f"User additional instruction / message: \"{user_inst}\""
            )

            try:
                if groq_key:
                    ai_report = call_groq(groq_key, system_prompt, history or [], jd_prompt)
                    source = "groq-llama-3.3-70b"
                elif gemini_key:
                    ai_report = call_gemini(gemini_key, system_prompt, history or [], jd_prompt)
                    source = "gemini"
                else:
                    ai_report = call_openai(openai_key, system_prompt, history or [], jd_prompt)
                    source = "openai"
                return {
                    "success": True,
                    "response": ai_report,
                    "analysis": jd_analysis,
                    "source": source
                }
            except Exception as e:
                print(f"[AI Service Warning] External AI call failed for JD analysis: {e}. Using deterministic report.")
                return {
                    "success": True,
                    "response": deterministic_report,
                    "analysis": jd_analysis,
                    "source": "deterministic-grounding"
                }

        return {
            "success": True,
            "response": deterministic_report,
            "analysis": jd_analysis,
            "source": "deterministic-grounding"
        }

    # 4. Handle standard chat queries
    if not clean_message:
        return {
            "success": False,
            "error": "Message cannot be empty."
        }

    groq_key = os.environ.get("GROQ_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")

    if groq_key or gemini_key or openai_key:
        system_prompt = build_system_prompt(portfolio)
        try:
            if groq_key:
                ai_text = call_groq(groq_key, system_prompt, history or [], clean_message)
                source = "groq-llama-3.3-70b"
            elif gemini_key:
                ai_text = call_gemini(gemini_key, system_prompt, history or [], clean_message)
                source = "gemini"
            else:
                ai_text = call_openai(openai_key, system_prompt, history or [], clean_message)
                source = "openai"
            return {
                "success": True,
                "response": ai_text,
                "source": source
            }
        except Exception as e:
            print(f"[AI Service Warning] External AI error: {e}. Falling back to deterministic grounding.")
            fallback_text = deterministic_grounding_engine(clean_message, portfolio, history or [])
            return {
                "success": True,
                "response": fallback_text,
                "source": "deterministic-grounding"
            }

    # Deterministic Grounding Fallback
    grounded_text = deterministic_grounding_engine(clean_message, portfolio, history or [])
    return {
        "success": True,
        "response": grounded_text,
        "source": "deterministic-grounding"
    }
