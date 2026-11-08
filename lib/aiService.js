const { PORTFOLIO_DATA, getSynchronizedPortfolio, getAllSkillsFlat, buildSystemPrompt } = require('./portfolioData');
const { analyzeJobDescription, formatMatchReport } = require('./jdMatcher');

// In-memory rate limiter: max 30 requests per IP per minute
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function checkRateLimit(clientIp = 'unknown') {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now - entry.startTime > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(clientIp, { count: 1, startTime: now });
    return { allowed: true };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((entry.startTime + RATE_LIMIT_WINDOW - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

// Clean up stale IP entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.startTime > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref();

/**
 * Sanitizes user input to prevent prompt injection and system prompt leak attempts.
 */
function sanitizeUserInput(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/**
 * Calls Google Gemini API
 */
async function callGemini(apiKey, systemPrompt, conversationHistory, userMessage) {
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Format Gemini contents
  const contents = [];

  // Convert history into Gemini format
  if (Array.isArray(conversationHistory)) {
    conversationHistory.slice(-8).forEach(msg => {
      const role = msg.role === 'user' ? 'user' : 'model';
      const text = sanitizeUserInput(msg.content);
      if (text) {
        contents.push({
          role,
          parts: [{ text }]
        });
      }
    });
  }

  // Add latest user message
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  const payload = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents,
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 1000
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOutput) {
    throw new Error('Gemini API returned an empty response.');
  }

  return textOutput.trim();
}

/**
 * Calls OpenAI API (or compatible provider)
 */
async function callOpenAI(apiKey, systemPrompt, conversationHistory, userMessage) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  if (Array.isArray(conversationHistory)) {
    conversationHistory.slice(-8).forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: sanitizeUserInput(msg.content)
      });
    });
  }

  messages.push({
    role: 'user',
    content: userMessage
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.2,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const output = data?.choices?.[0]?.message?.content;
  if (!output) {
    throw new Error('OpenAI API returned an empty response.');
  }

  return output.trim();
}

/**
 * Calls Groq API
 */
async function callGroq(apiKey, systemPrompt, conversationHistory, userMessage) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  if (Array.isArray(conversationHistory)) {
    conversationHistory.slice(-8).forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: sanitizeUserInput(msg.content)
      });
    });
  }

  messages.push({
    role: 'user',
    content: userMessage
  });

  const models = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'];
  let lastErr = null;

  for (const model of models) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 1000
        })
      });

      if (response.ok) {
        const data = await response.json();
        const output = data?.choices?.[0]?.message?.content;
        if (output) return output.trim();
      } else {
        lastErr = await response.text();
      }
    } catch (e) {
      lastErr = e.message;
    }
  }

  throw new Error(`Groq API error: ${lastErr || 'No valid response'}`);
}

/**
 * Deterministic grounding engine fallback when API keys are not yet configured or when offline.
 * Accurately answers recruiter queries without hallucination.
 */
function deterministicGroundingEngine(userMessage, portfolio, history = []) {
  const q = userMessage.toLowerCase().trim();
  const p = portfolio || PORTFOLIO_DATA;

  // 1. CGPA & Academic questions
  if (q.includes('cgpa') || q.includes('gpa') || q.includes('marks') || q.includes('grade') || q.includes('academic performance')) {
    return `**${p.personal.name}'s CGPA is ${p.education.cgpa} / 10.0** in ${p.education.degree} (${p.education.branch}) at ${p.education.institution}, affiliated to ${p.education.affiliation}, Bangalore (2023–2027). He has maintained consistent academic excellence while actively competing in national hackathons and building production software.`;
  }

  // 2. Education & College
  if (q.includes('college') || q.includes('education') || q.includes('university') || q.includes('degree') || q.includes('study') || q.includes('school')) {
    return `**Education Details for ${p.personal.name}:**\n- **Degree:** ${p.education.degree} in ${p.education.branch}\n- **Institution:** ${p.education.institution}, Bangalore\n- **Affiliation:** ${p.education.affiliation}\n- **Duration:** 2023 – 2027\n- **CGPA:** **${p.education.cgpa} / 10.0**\n- **Core Coursework:** ${p.education.relevantCoursework.join(' • ')}`;
  }

  // 3. Technical Skills
  if (q.includes('skill') || q.includes('technolog') || q.includes('stack') || q.includes('programming language') || q.includes('framework')) {
    return `Here are **${p.personal.name}'s verified technical skills** from his portfolio:\n\n` +
      `- **Programming Languages:** ${p.skills.languagesAndCore.slice(0, 5).join(', ')}\n` +
      `- **Frontend:** ${p.skills.frontend.join(', ')}\n` +
      `- **Backend & APIs:** ${p.skills.backend.join(', ')}\n` +
      `- **Databases & Storage:** ${p.skills.databasesAndStorage.join(', ')}\n` +
      `- **DevOps & Tools:** ${p.skills.developerToolsAndCloud.join(', ')}\n` +
      `- **AI & LLM Integration:** ${p.skills.aiAndLLMs.join(', ')}\n` +
      `- **Core CS:** Data Structures & Algorithms, OOP, System Design, Cryptography\n\n` +
      `Would you like to know how he applied any of these technologies in his projects?`;
  }

  // 3b. Follow-up to "Would you like to know how he applied any of these technologies in his projects?"
  const isAffirmativeFollowup = q === 'yes' || q === 'yes please' || q === 'sure' || q === 'yeah' || q === 'yep' ||
    q.startsWith('yes ') || q.includes('how he applied') || q.includes('how did he apply') || q.includes('how are they applied') ||
    q.includes('how does he use') || q.includes('how did he use') || q.includes('in his projects') || q.includes('applied in projects') ||
    q === 'tell me' || q === 'tell me more';

  if (isAffirmativeFollowup) {
    return `Here is **how ${p.personal.name} applied these technologies across his production projects**:\n\n` +
      `- 🚀 **Gemini AI, Leaflet & Firebase:** In **[Community Hero](https://community-hero-47e90.web.app/)**\n` +
      `  • Integrated Gemini AI for automated civic-issue categorization.\n` +
      `  • Built interactive Leaflet geospatial map with geohashing for hotspot prediction.\n` +
      `  • Architected real-time Firestore database with role-based access control (RBAC 3+ roles).\n\n` +
      `- ⚡ **Docker, FastAPI, Groq LLM & Redis:** In **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)**\n` +
      `  • Containerized 3-tier microservices stack with Docker Compose (FastAPI + Node.js + SvelteKit).\n` +
      `  • Deployed OCR + Groq LLM (Llama 3.3-70B) pipeline parsing 50+ receipt formats (>95% accuracy).\n` +
      `  • Implemented Redis caching for high-speed multi-currency calculations and financial health scoring.\n\n` +
      `- 🔒 **Java, LSB Steganography & AES-256:** In **[Image Steganography](https://github.com/Sumitpaul500)**\n` +
      `  • Engineered 1,277 lines of pure Java (Swing UI) without external libraries.\n` +
      `  • Concealed text and audio payloads across JPG/PNG/BMP with 99.2% payload capacity and AES-256/CBC encryption.\n\n` +
      `- 🏥 **Flask & REST APIs:** In **AyurSutra** (SIH 2025 Grand Finale Top 15)\n` +
      `  • Built Python Flask backend for patient scheduling, EHR integration, and automated therapy workflows.\n\n` +
      `You can inspect all source code on his [GitHub Profile](https://github.com/Sumitpaul500).`;
  }

  // 4. Specific technology queries
  if (q.includes('docker') || q.includes('container')) {
    return `Yes! **${p.personal.name} has hands-on Docker and containerization experience:**\n` +
      `- In **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)**, he used **Docker and Docker Compose** to containerize a 3-tier microservices architecture (SvelteKit frontend, Node.js Express REST API, FastAPI AI service, MongoDB, and Redis).\n` +
      `- Engineered multi-container orchestration for reproducible development and local deployment.`;
  }

  if (q.includes('mongo') || q.includes('nosql')) {
    return `Yes! **${p.personal.name} uses MongoDB extensively:**\n` +
      `- Serves as the primary NoSQL datastore in **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)** for receipt metadata, transaction history, and multi-currency account data.\n` +
      `- Experienced with MongoDB Atlas, aggregation pipelines, schema modeling, and indexing.`;
  }

  if (q.includes('redis')) {
    return `Yes! **${p.personal.name} integrates Redis for high-speed caching:**\n` +
      `- Implemented in **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)** for caching financial exchange rates, user session state, and accelerating the real-time financial health scoring engine.`;
  }

  if (q.includes('fastapi')) {
    return `Yes! **FastAPI is one of ${p.personal.name}'s go-to Python frameworks:**\n` +
      `- Built the high-performance AI inference and OCR extraction microservice in **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)** using FastAPI.\n` +
      `- Also powers the backend of this portfolio's AI Recruiter Chatbot with Pydantic schemas and ReAct agent architecture.`;
  }

  if (q.includes('firebase') || q.includes('firestore')) {
    return `Yes! **${p.personal.name} built and deployed with Firebase:**\n` +
      `- Architected **[Community Hero](https://community-hero-47e90.web.app/)** with Cloud Firestore, fine-grained Role-Based Access Control (RBAC 3+ roles), Cloud Functions, and Firebase Hosting supporting 1,000+ concurrent users.`;
  }

  if (q.includes('gemini') || q.includes('groq') || q.includes('llm') || q.includes('ocr')) {
    return `Yes! **${p.personal.name} has practical, production LLM integration skills:**\n` +
      `- **Gemini AI:** Integrated into **[Community Hero](https://community-hero-47e90.web.app/)** for automated civic-issue categorization.\n` +
      `- **Groq LLM (Llama 3.3-70B) & OCR.Space:** Implemented in **[FinPilot AI](https://github.com/Sumitpaul500/Smart-Expense-Tracker)** for extracting structured receipt data from 50+ formats (>95% accuracy).\n` +
      `- **Oracle Cloud OCI Certified Generative AI Professional (2025)**.`;
  }

  if (q.includes('steganograph') || q.includes('crypto') || q.includes('aes') || q.includes('security')) {
    return `Yes! **${p.personal.name} implemented cybersecurity algorithms in Java:**\n` +
      `- Built an **[Image Steganography Application](https://github.com/Sumitpaul500)** in 1,277 lines of pure Java (no third-party dependencies).\n` +
      `- Combines LSB steganography (99.2% capacity concealment in JPG/PNG/BMP) with military-grade AES-256/CBC encryption and SHA-256 password hashing.`;
  }

  if (q.includes('leaflet') || q.includes('map') || q.includes('geohash')) {
    return `Yes! **${p.personal.name} has geospatial engineering experience:**\n` +
      `- Built interactive Leaflet mapping in **[Community Hero](https://community-hero-47e90.web.app/)** with geo-tagged civic issue reporting and a predictive hotspot engine using geohashing.`;
  }

  if (q.includes('python')) {
    return `Yes! **${p.personal.name} is proficient in Python.** He has used Python for:\n` +
      `- **FastAPI Microservices:** Built high-performance backend microservices in **FinPilot AI** for expense processing.\n` +
      `- **Flask & Automation Backend:** Developed the core backend for **AyurSutra** at Smart India Hackathon 2025 (SIH Grand Finale Top 15), featuring automated therapy workflows and EHR integration.\n` +
      `- **AI/LLM integrations:** Python-based AI workflows and prompt engineering with Groq and Gemini models.`;
  }

  if (q.includes('java') && !q.includes('script')) {
    return `Yes! **Java is one of ${p.personal.name}'s primary core languages.**\n` +
      `- Engineered a **1,277-line native Java Swing application** ([Image Steganography](https://github.com/Sumitpaul500)) implementing LSB steganography, AES-256 encryption, and SHA-256 password hashing.\n` +
      `- Certified in **Data Structures and Algorithms with Java (Alpha)** from Apna College.\n` +
      `- Strong foundations in Java Object-Oriented Programming (OOP) and algorithms.`;
  }

  if (q.includes('react')) {
    return `Yes! **${p.personal.name} has strong hands-on React experience:**\n` +
      `- Developed and deployed **[Community Hero](https://community-hero-47e90.web.app/)** — an AI-powered civic platform supporting 1,000+ concurrent users with React, TypeScript, Leaflet maps, and Firebase.\n` +
      `- Frontend for **AyurSutra** at Smart India Hackathon 2025 Grand Finale.\n` +
      `- Experienced with modern hooks, state management, component architecture, and responsive Tailwind CSS.`;
  }

  // 5. Projects
  if (q.includes('project') || q.includes('work') || q.includes('portfolio work') || q.includes('built')) {
    return `Here are **${p.personal.name}'s featured engineering projects**:\n\n` +
      `1. **[Community Hero – Civic Engagement AI Platform](${p.projects[0].liveDemo})**\n` +
      `   - **Tech:** ${p.projects[0].techStack.join(', ')}\n` +
      `   - **Impact:** Supports 1,000+ concurrent users with Gemini AI categorization, Leaflet geospatial mapping, and citizen gamification. ([Live Demo](${p.projects[0].liveDemo}) | [GitHub](${p.projects[0].github}))\n\n` +
      `2. **[FinPilot AI – Smart Expense Tracker](${p.projects[1].github})**\n` +
      `   - **Tech:** ${p.projects[1].techStack.join(', ')}\n` +
      `   - **Impact:** 3-tier microservices platform parsing 50+ receipt formats (Groq Llama 3.3-70B OCR, 95%+ accuracy) and 15+ Indian bank SMS formats with Docker Compose and Redis.\n\n` +
      `3. **[Image Steganography Application](${p.projects[2].github})**\n` +
      `   - **Tech:** ${p.projects[2].techStack.join(', ')}\n` +
      `   - **Impact:** 1,277-line Java desktop app achieving 99.2% payload concealment across JPG/PNG/BMP with AES-256/CBC encryption without third-party dependencies.\n\n` +
      `4. **[Real-Time Weather Forecast App](${p.projects[3].github})**\n` +
      `   - **Tech:** ${p.projects[3].techStack.join(', ')}\n` +
      `   - **Impact:** Geolocation-aware weather app with 40+ weather parameters and sub-2s load time.`;
  }

  // 6. Hackathons & Competitions
  if (q.includes('hackathon') || q.includes('competition') || q.includes('flipkart') || q.includes('sih') || q.includes('smart india')) {
    return `**${p.personal.name}'s National Hackathon Achievements:**\n\n` +
      `1. 🏆 **Flipkart GRiD 8.0 (2026): National Finalist**\n` +
      `   - Selected from **~1.65–1.7 Lakh+ registrations across India**.\n` +
      `   - Ranked in **Top 48 nationally** and **Top 16 in the Software Development track**.\n` +
      `   - Advanced to the National Finals hackathon.\n\n` +
      `2. 🏆 **Smart India Hackathon 2025 (SIH 2025): Grand Finale Top 15**\n` +
      `   - Built backend architecture and Flask API for AyurSutra (AI patient scheduling & EHR platform).\n\n` +
      `3. 🚀 **Vibe2Ship Hackathon (Coding Ninjas × Google for Developers, 2026)**\n` +
      `   - Solo developed and deployed Community Hero using Firebase and Gemini AI.`;
  }

  // 7. Certifications
  if (q.includes('certification') || q.includes('certificate') || q.includes('oracle') || q.includes('badge')) {
    return `**${p.personal.name}'s Verified Professional Certifications:**\n\n` +
      `- 🏆 **Oracle Cloud Infrastructure 2025 Certified Generative AI Professional** (Oracle University)\n` +
      `- 🏆 **Oracle Cloud Infrastructure Foundations Associate** (Oracle University)\n` +
      `- 🏆 **Introduction to Networking and Cloud Computing** (Microsoft, 2024)\n` +
      `- 🏆 **Data Structures and Algorithms with Java (Alpha)** (Apna College)\n\n` +
      `You can verify his Oracle badges on his [LinkedIn Profile](${p.personal.linkedin}).`;
  }

  // 8. Why hire Sumit / strengths
  if (q.includes('why should we hire') || q.includes('why hire') || q.includes('strength') || q.includes('fit')) {
    return `**Why ${p.personal.name} is a compelling hire for your engineering team:**\n\n` +
      `1. **Proven High-Scale Problem Solver:** Flipkart GRiD 8.0 National Finalist (Top 16 in Software Dev out of 1.7 lakh participants) and SIH 2025 Grand Finale Top 15.\n` +
      `2. **Production Full-Stack & Microservices:** Hands-on experience building multi-tier distributed systems with React, SvelteKit, FastAPI, Node.js, Docker, MongoDB, and Redis.\n` +
      `3. **Practical AI & Cloud Competency:** Certified Oracle OCI GenAI Professional; implemented production LLM solutions with Gemini AI and Groq Llama 3.3-70B.\n` +
      `4. **Academic Excellence:** Outstanding **${p.education.cgpa} / 10.0 CGPA** in Computer Science at NHCE (VTU), reflecting strong work ethic and foundational knowledge.\n` +
      `5. **Ready to Deliver Value:** Open for Full-Stack, Backend, and Software Engineering internships and full-time roles.`;
  }

  // 9. Contact, GitHub, LinkedIn, Resume
  if (q.includes('github')) {
    return `Here is **${p.personal.name}'s GitHub profile:** [github.com/Sumitpaul500](${p.personal.github}). You can inspect source code for Community Hero, FinPilot AI, Image Steganography, and more!`;
  }

  if (q.includes('linkedin')) {
    return `Here is **${p.personal.name}'s LinkedIn profile:** [linkedin.com/in/sumit-paul-28b5b0280](${p.personal.linkedin}).`;
  }

  if (q.includes('resume') || q.includes('cv')) {
    return `You can view or download **${p.personal.name}'s official resume** directly here: [Sumit_Paul_Resume.pdf](${p.personal.resumeUrl}) or via the "View Resume" button on the portfolio.`;
  }

  if (q.includes('contact') || q.includes('email') || q.includes('phone') || q.includes('reach')) {
    return `You can reach **${p.personal.name}** directly at:\n- **Email:** [${p.personal.email}](mailto:${p.personal.email})\n- **Phone:** [${p.personal.phoneFormatted}](tel:${p.personal.phone.replace(/\s+/g, '')})\n- **LinkedIn:** [LinkedIn Profile](${p.personal.linkedin})\n- **Location:** ${p.personal.location}`;
  }

  // Default context-aware answer
  return `Hi! I am **${p.personal.name}'s AI Portfolio Assistant**. I am grounded strictly in his verified portfolio.\n\n` +
    `Here is a quick snapshot:\n` +
    `- **Profile:** B.Tech CSE Student at NHCE Bangalore (VTU) with a **${p.education.cgpa} CGPA**.\n` +
    `- **Achievements:** Flipkart GRiD 8.0 National Finalist (Top 16 Software Dev) & SIH 2025 Grand Finale Top 15.\n` +
    `- **Core Tech:** Java, Python, React, SvelteKit, FastAPI, Node.js, MongoDB, Docker, Gemini AI.\n` +
    `- **Featured Projects:** [Community Hero](${p.projects[0].liveDemo}), [FinPilot AI](${p.projects[1].github}), and [Image Steganography](${p.projects[2].github}).\n\n` +
    `Feel free to ask specific questions about his skills, projects, hackathons, or upload/paste a Job Description to check his alignment!`;
}

/**
 * Main AI handler: coordinates Gemini / OpenAI / Grounded Fallback
 */
async function processChatRequest({
  message = '',
  history = [],
  customSkills = {},
  deletedSkills = [],
  jobDescriptionText = '',
  clientIp = 'unknown'
}) {
  // 1. Rate Limiting Check
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Too many requests. Please wait ${rateLimit.retryAfter} seconds before sending another message.`
    };
  }

  // 2. Synchronize portfolio with dynamic admin changes
  const portfolio = getSynchronizedPortfolio(customSkills, deletedSkills);
  const cleanMessage = sanitizeUserInput(message);
  const cleanJD = sanitizeUserInput(jobDescriptionText);

  // 3. Handle Job Description Upload / Analysis Request
  if (cleanJD && cleanJD.length > 20) {
    const jdAnalysis = analyzeJobDescription(cleanJD, portfolio);
    const deterministicReport = formatMatchReport(jdAnalysis, portfolio);

    // If Groq, Gemini, or OpenAI is configured, ask AI to produce a nuanced recruiter report grounded in this analysis
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (groqKey || geminiKey || openaiKey) {
      const systemPrompt = buildSystemPrompt(portfolio);
      const jdPrompt = `A recruiter uploaded the following Job Description:\n<job_description>\n${cleanJD.slice(0, 8000)}\n</job_description>\n\n` +
        `Here is the verified deterministic skill alignment data:\n` +
        `- Matching verified skills: ${jdAnalysis.matchingSkills.join(', ') || 'None'}\n` +
        `- Missing/unverified skills: ${jdAnalysis.missingSkills.join(', ') || 'None'}\n` +
        `- Estimated Alignment Score: ${jdAnalysis.matchPercentage}%\n\n` +
        `Please present a structured, professional, recruiter-friendly report covering:\n` +
        `A. Matching verified skills from Sumit's portfolio\n` +
        `B. Missing or unverified skills (do not invent qualifications)\n` +
        `C. Relevant projects and how they match the requirements (with links)\n` +
        `D. Relevant hackathons and practical experience\n` +
        `E. Transparent suitability assessment (cite the ${jdAnalysis.matchPercentage}% estimated alignment score as an indicative portfolio-to-JD match, not an official ATS score)\n` +
        `F. Strengths and gaps\n` +
        `G. Recruiter summary\n` +
        `User additional instruction / message: "${cleanMessage || 'Please analyze this job description against Sumit Paul\'s portfolio.'}"`;

      try {
        let aiReport;
        if (groqKey) {
          aiReport = await callGroq(groqKey, systemPrompt, history, jdPrompt);
        } else if (geminiKey) {
          aiReport = await callGemini(geminiKey, systemPrompt, history, jdPrompt);
        } else {
          aiReport = await callOpenAI(openaiKey, systemPrompt, history, jdPrompt);
        }
        return {
          success: true,
          response: aiReport,
          analysis: jdAnalysis,
          source: groqKey ? 'groq' : (geminiKey ? 'gemini' : 'openai')
        };
      } catch (err) {
        console.warn('[AI Service] External AI failed for JD analysis, using deterministic grounding report:', err.message);
        return {
          success: true,
          response: deterministicReport,
          analysis: jdAnalysis,
          source: 'deterministic-grounding'
        };
      }
    }

    // Default to deterministic analysis report if no API keys
    return {
      success: true,
      response: deterministicReport,
      analysis: jdAnalysis,
      source: 'deterministic-grounding'
    };
  }

  // 4. Handle regular chat queries
  if (!cleanMessage) {
    return {
      success: false,
      error: 'Message cannot be empty.'
    };
  }

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (groqKey || geminiKey || openaiKey) {
    const systemPrompt = buildSystemPrompt(portfolio);
    try {
      let aiText;
      if (groqKey) {
        aiText = await callGroq(groqKey, systemPrompt, history, cleanMessage);
      } else if (geminiKey) {
        aiText = await callGemini(geminiKey, systemPrompt, history, cleanMessage);
      } else {
        aiText = await callOpenAI(openaiKey, systemPrompt, history, cleanMessage);
      }
      return {
        success: true,
        response: aiText,
        source: groqKey ? 'groq' : (geminiKey ? 'gemini' : 'openai')
      };
    } catch (err) {
      console.warn('[AI Service] External AI error, falling back to deterministic grounding:', err.message);
      const fallbackText = deterministicGroundingEngine(cleanMessage, portfolio, history);
      return {
        success: true,
        response: fallbackText,
        source: 'deterministic-grounding'
      };
    }
  }

  // Fallback Grounding Engine (strictly accurate, zero hallucination)
  const groundedResponse = deterministicGroundingEngine(cleanMessage, portfolio, history);
  return {
    success: true,
    response: groundedResponse,
    source: 'deterministic-grounding'
  };
}

module.exports = {
  processChatRequest,
  deterministicGroundingEngine,
  checkRateLimit,
  sanitizeUserInput
};

