const { PORTFOLIO_DATA, getAllSkillsFlat } = require('./portfolioData');

// Comprehensive dictionary of technical skills and patterns
const TECH_CATALOG = [
  // Programming Languages
  { canonical: 'Java', patterns: [/\bjava\b/i], category: 'Languages' },
  { canonical: 'Python', patterns: [/\bpython\b/i], category: 'Languages' },
  { canonical: 'C', patterns: [/\bc\b/i, /\bc\s+lang\b/i], category: 'Languages' },
  { canonical: 'C++', patterns: [/\bc\+\+\b/i, /\bcpp\b/i], category: 'Languages' },
  { canonical: 'C#', patterns: [/\bc#\b/i, /\bcsharp\b/i], category: 'Languages' },
  { canonical: 'JavaScript', patterns: [/\bjavascript\b/i, /\bjs\b/i], category: 'Languages' },
  { canonical: 'TypeScript', patterns: [/\btypescript\b/i, /\bts\b/i], category: 'Languages' },
  { canonical: 'Go', patterns: [/\bgolang\b/i, /\bgo\b/i], category: 'Languages' },
  { canonical: 'Rust', patterns: [/\brust\b/i], category: 'Languages' },
  { canonical: 'Kotlin', patterns: [/\bkotlin\b/i], category: 'Languages' },
  { canonical: 'Swift', patterns: [/\bswift\b/i], category: 'Languages' },
  { canonical: 'PHP', patterns: [/\bphp\b/i], category: 'Languages' },
  { canonical: 'Ruby', patterns: [/\bruby\b/i], category: 'Languages' },
  { canonical: 'SQL', patterns: [/\bsql\b/i], category: 'Languages' },

  // Frontend
  { canonical: 'React', patterns: [/\breact(\.js)?\b/i], category: 'Frontend' },
  { canonical: 'SvelteKit', patterns: [/\bsveltekit\b/i, /\bsvelte\b/i], category: 'Frontend' },
  { canonical: 'Tailwind CSS', patterns: [/\btailwind(\s*css)?\b/i], category: 'Frontend' },
  { canonical: 'HTML5', patterns: [/\bhtml5?\b/i], category: 'Frontend' },
  { canonical: 'CSS3', patterns: [/\bcss3?\b/i], category: 'Frontend' },
  { canonical: 'Bootstrap', patterns: [/\bbootstrap\b/i], category: 'Frontend' },
  { canonical: 'Next.js', patterns: [/\bnext(\.js)?\b/i], category: 'Frontend' },
  { canonical: 'Vue.js', patterns: [/\bvue(\.js)?\b/i], category: 'Frontend' },
  { canonical: 'Angular', patterns: [/\bangular\b/i], category: 'Frontend' },
  { canonical: 'Redux', patterns: [/\bredux\b/i], category: 'Frontend' },

  // Backend & APIs
  { canonical: 'Node.js', patterns: [/\bnode(\.js)?\b/i], category: 'Backend' },
  { canonical: 'Express.js', patterns: [/\bexpress(\.js)?\b/i], category: 'Backend' },
  { canonical: 'FastAPI', patterns: [/\bfastapi\b/i], category: 'Backend' },
  { canonical: 'Flask', patterns: [/\bflask\b/i], category: 'Backend' },
  { canonical: 'Django', patterns: [/\bdjango\b/i], category: 'Backend' },
  { canonical: 'Spring Boot', patterns: [/\bspring(\s*boot)?\b/i], category: 'Backend' },
  { canonical: 'REST APIs', patterns: [/\brest(ful)?\s*(api|apis)?\b/i], category: 'Backend' },
  { canonical: 'GraphQL', patterns: [/\bgraphql\b/i], category: 'Backend' },
  { canonical: 'JWT Authentication', patterns: [/\bjwt\b/i, /\bjson\s*web\s*token\b/i], category: 'Backend' },
  { canonical: 'Microservices', patterns: [/\bmicroservices?\b/i], category: 'Backend' },

  // Databases & Storage
  { canonical: 'MongoDB', patterns: [/\bmongodb\b/i, /\bmongo\b/i], category: 'Databases' },
  { canonical: 'PostgreSQL', patterns: [/\bpostgres(ql)?\b/i], category: 'Databases' },
  { canonical: 'MySQL', patterns: [/\bmysql\b/i], category: 'Databases' },
  { canonical: 'SQLite', patterns: [/\bsqlite\b/i], category: 'Databases' },
  { canonical: 'MSSQL', patterns: [/\bmssql\b/i, /\bmicrosoft\s*sql\b/i, /\bsql\s*server\b/i], category: 'Databases' },
  { canonical: 'Redis', patterns: [/\bredis\b/i], category: 'Databases' },
  { canonical: 'Firebase', patterns: [/\bfirebase\b/i, /\bfirestore\b/i], category: 'Databases' },
  { canonical: 'NoSQL', patterns: [/\bnosql\b/i], category: 'Databases' },
  { canonical: 'Cassandra', patterns: [/\bcassandra\b/i], category: 'Databases' },

  // Cloud & DevOps
  { canonical: 'Docker', patterns: [/\bdocker(\s*compose)?\b/i], category: 'DevOps' },
  { canonical: 'Kubernetes', patterns: [/\bkubernetes\b/i, /\bk8s\b/i], category: 'DevOps' },
  { canonical: 'AWS', patterns: [/\baws\b/i, /\bamazon\s*web\s*services\b/i], category: 'Cloud' },
  { canonical: 'GCP', patterns: [/\bgcp\b/i, /\bgoogle\s*cloud\b/i], category: 'Cloud' },
  { canonical: 'Azure', patterns: [/\bazure\b/i], category: 'Cloud' },
  { canonical: 'OCI (Oracle Cloud)', patterns: [/\boci\b/i, /\boracle\s*cloud\b/i], category: 'Cloud' },
  { canonical: 'Git', patterns: [/\bgit\b/i], category: 'Tools' },
  { canonical: 'GitHub', patterns: [/\bgithub\b/i], category: 'Tools' },
  { canonical: 'Linux', patterns: [/\blinux\b/i, /\bunix\b/i], category: 'Tools' },
  { canonical: 'CI/CD', patterns: [/\bci\s*\/\s*cd\b/i, /\bjenkins\b/i, /\bgithub\s*actions\b/i], category: 'DevOps' },

  // AI & Data
  { canonical: 'Gemini AI', patterns: [/\bgemini\b/i], category: 'AI' },
  { canonical: 'LLMs', patterns: [/\bllm(s)?\b/i, /\blarge\s*language\s*model\b/i, /\bgenai\b/i, /\bgenerative\s*ai\b/i], category: 'AI' },
  { canonical: 'Machine Learning', patterns: [/\bmachine\s*learning\b/i, /\bml\b/i], category: 'AI' },
  { canonical: 'Data Structures & Algorithms', patterns: [/\bdsa\b/i, /\bdata\s*structures\b/i, /\balgorithms\b/i], category: 'CS' },
  { canonical: 'System Design', patterns: [/\bsystem\s*design\b/i], category: 'CS' },
  { canonical: 'OOP', patterns: [/\boop\b/i, /\bobject\s*oriented\b/i], category: 'CS' },
  { canonical: 'Figma', patterns: [/\bfigma\b/i], category: 'Design' },
  { canonical: 'Tableau', patterns: [/\btableau\b/i], category: 'Analytics' },
  { canonical: 'Power BI', patterns: [/\bpower\s*bi\b/i], category: 'Analytics' }
];

/**
 * Extracts technical skills required from job description text.
 */
function extractSkillsFromJD(text) {
  if (!text) return [];
  const detected = new Map();

  for (const item of TECH_CATALOG) {
    for (const pat of item.patterns) {
      if (pat.test(text)) {
        detected.set(item.canonical, item);
        break;
      }
    }
  }

  return Array.from(detected.values());
}

/**
 * Performs transparent, deterministic matching between JD skills and Sumit's portfolio.
 */
function analyzeJobDescription(jdText, portfolioData) {
  const p = portfolioData || PORTFOLIO_DATA;
  const verifiedSkillsFlat = getAllSkillsFlat(p).map(s => s.toLowerCase());

  // Helper to check verified portfolio skill
  function isVerified(skillName) {
    const sLower = skillName.toLowerCase();
    return verifiedSkillsFlat.some(v => v.includes(sLower) || sLower.includes(v));
  }

  const jdSkills = extractSkillsFromJD(jdText);

  // If no predefined catalog skill matched, split words/phrases
  const matchingSkills = [];
  const missingSkills = [];

  jdSkills.forEach(skill => {
    if (isVerified(skill.canonical)) {
      matchingSkills.push(skill.canonical);
    } else {
      missingSkills.push(skill.canonical);
    }
  });

  // Calculate deterministic score
  const total = matchingSkills.length + missingSkills.length;
  const matchPercentage = total > 0 ? Math.round((matchingSkills.length / total) * 100) : 0;

  // Identify relevant projects based on matching skills
  const relevantProjects = [];
  p.projects.forEach(proj => {
    const matchedInProject = proj.techStack.filter(tech =>
      matchingSkills.some(ms => ms.toLowerCase() === tech.toLowerCase() || tech.toLowerCase().includes(ms.toLowerCase()))
    );
    if (matchedInProject.length > 0) {
      relevantProjects.push({
        title: proj.title,
        category: proj.category,
        matchedTech: matchedInProject,
        link: proj.liveDemo || proj.github,
        summary: proj.summary,
        relevance: `${matchedInProject.join(', ')} directly demonstrated in this project.`
      });
    }
  });

  // Sort projects by number of matched technologies
  relevantProjects.sort((a, b) => b.matchedTech.length - a.matchedTech.length);

  // Identify relevant hackathons & experiences
  const relevantExperience = [];
  p.hackathonsAndCompetitions.forEach(h => {
    relevantExperience.push({
      title: h.title,
      summary: h.achievement
    });
  });

  return {
    matchPercentage,
    matchingSkills,
    missingSkills,
    relevantProjects: relevantProjects.slice(0, 3),
    relevantExperience: relevantExperience.slice(0, 2),
    rawSkillCount: total
  };
}

/**
 * Formats a clean, professional recruiter-ready report.
 */
function formatMatchReport(analysis, portfolioData) {
  const p = portfolioData || PORTFOLIO_DATA;
  const { matchPercentage, matchingSkills, missingSkills, relevantProjects, relevantExperience, rawSkillCount } = analysis;

  let report = `### 📊 Job Description Alignment Analysis\n\n`;

  // Transparent Alignment Score & Disclaimer
  report += `**Estimated Portfolio-to-JD Alignment:** **\`${matchPercentage}%\`** (${matchingSkills.length} of ${rawSkillCount} detected technical requirements)\n`;
  report += `> *Note: This alignment score is calculated deterministically by comparing documented skills and projects in ${p.personal.name}'s portfolio against the extracted requirements from the job description. It is not an official automated ATS score.*\n\n`;

  // A. Matching Skills
  report += `#### ✅ A. Matching Verified Skills\n`;
  if (matchingSkills.length > 0) {
    report += `The following requirements are **explicitly verified** in ${p.personal.name}'s portfolio:\n`;
    report += matchingSkills.map(s => `- **${s}**`).join('\n') + '\n\n';
  } else {
    report += `*No direct 1:1 match found with the explicit technical skills listed in the job description.*\n\n`;
  }

  // B. Missing or Unverified Skills
  report += `#### ⚠️ B. Missing or Unverified Skills\n`;
  if (missingSkills.length > 0) {
    report += `The following required skills are **not currently documented** in ${p.personal.name}'s portfolio:\n`;
    report += missingSkills.map(s => `- **${s}** *(not listed in portfolio)*`).join('\n') + '\n\n';
  } else {
    report += `*All identified technical skills in the job description are covered in ${p.personal.name}'s portfolio!*\n\n`;
  }

  // C. Relevant Projects
  report += `#### 🚀 C. Relevant Portfolio Projects\n`;
  if (relevantProjects.length > 0) {
    relevantProjects.forEach((proj, i) => {
      report += `${i + 1}. **${proj.title}** (${proj.category})\n`;
      report += `   - **Demonstrated Skills:** ${proj.matchedTech.join(', ')}\n`;
      report += `   - **Relevance:** ${proj.relevance}\n`;
      if (proj.link) report += `   - **Reference Link:** [View Project Code / Demo](${proj.link})\n`;
    });
    report += '\n';
  } else {
    report += `*See all featured projects in the portfolio including Community Hero (React, Firebase, AI) and FinPilot AI (Microservices, FastAPI, Node.js, MongoDB).*\n\n`;
  }

  // D. Relevant Experience & Hackathons
  report += `#### 🏆 D. Relevant Hackathon & Practical Experience\n`;
  if (relevantExperience.length > 0) {
    relevantExperience.forEach(exp => {
      report += `- **${exp.title}:** ${exp.summary}\n`;
    });
    report += '\n';
  }

  // E & F. Suitability Assessment, Strengths and Gaps
  report += `#### 💡 E & F. Strengths and Gaps Assessment\n`;
  report += `- **Key Strengths:** Strong foundations in Computer Science (CGPA: **${p.education.cgpa}**), proven competitive hackathon track record (Flipkart GRiD 8.0 National Finalist, SIH 2025 Grand Finale Top 15), and full-stack development capability spanning modern frontend, scalable microservices, and practical AI/LLM integration.\n`;
  if (missingSkills.length > 0) {
    report += `- **Gaps / Areas to Confirm:** ${missingSkills.slice(0, 3).join(', ')} ${missingSkills.length > 3 ? `and others` : ''} are not documented in his current portfolio; recommend confirming candidate's practical familiarity or fast-learning capacity during technical interviews.\n\n`;
  } else {
    report += `- **Gaps:** None detected based on the provided skills list.\n\n`;
  }

  // G. Recruiter-Friendly Summary
  report += `#### 📝 G. Recruiter Summary\n`;
  report += `${p.personal.name} is a high-achieving Computer Science student and developer with demonstrated end-to-end engineering skills in full-stack web applications, microservices, and AI integrations. Based strictly on documented portfolio evidence, he represents a strong fit for roles emphasizing ${matchingSkills.slice(0, 4).join(', ')}.`;

  return report;
}

module.exports = {
  TECH_CATALOG,
  extractSkillsFromJD,
  analyzeJobDescription,
  formatMatchReport
};

