
const SYNONYMS = {
    'creator': ['founder', 'owner', 'author', 'maker', 'developer', 'ajmal', 'ajmal uk'],
    'created': ['founded', 'made', 'built', 'developed', 'founder', 'creator', 'origin'],
    'create': ['build', 'develop', 'make', 'found', 'originate'],
    'maker': ['founder', 'creator', 'owner', 'developer'],
    'owner': ['founder', 'creator', 'holder', 'proprietor', 'ajmal'],
    'who': ['founder', 'creator', 'owner', 'developer', 'person', 'identity'],
    'identity': ['who', 'creator', 'founder', 'owner', 'developer'],
    'company': ['uthakkan', 'studio', 'business', 'organization', 'firm'],
    'uthakkan': ['company', 'studio', 'creator', 'founder'],
    'contact': ['email', 'phone', 'address', 'reach', 'mail', 'telegram', 'whatsapp'],
    'mail': ['email', 'inbox', 'gmail'],
    'site': ['website', 'url', 'link', 'page', 'portal'],
    'web': ['website', 'url', 'internet', 'online'],
    'link': ['url', 'website', 'address'],
    'job': ['career', 'hiring', 'freelance', 'work', 'project'],
    'hire': ['freelance', 'job', 'work', 'gig']
};

const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'this', 'that', 'it', 'its', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'your', 'my', 'our', 'their', 'you', 'me']);

function extractTerms(query) {
    return query
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));
}

function calculateTermRelevance(text, terms) {
    if (!text) return 0;
    const lowerText = text.toLowerCase();
    let matches = 0;

    const identityTerms = ['who', 'created', 'owner', 'founder', 'creator', 'uthakkan', 'ajmal'];
    const isIdentityQuery = terms.some(t => identityTerms.includes(t));

    for (const term of terms) {
        let termMatched = false;

        if (lowerText.includes(term)) {
            termMatched = true;
        }
        else {
            const synonyms = SYNONYMS[term] || [];
            for (const syn of synonyms) {
                if (lowerText.includes(syn)) {
                    termMatched = true;
                    break;
                }
            }
        }

        if (termMatched) {
            matches++;
        }
    }

    let relevance = terms.length > 0 ? matches / terms.length : 0;
    if (isIdentityQuery && relevance > 0) {
        relevance *= 1.5;
    }

    return Math.min(1.0, relevance);
}

const queries = [
    "Who created You? who is your owner",
    "who are you?",
    "what is UTHAKKAN?",
    "who is Ajmal U K?"
];

const testTexts = [
    "I was created by Ajmal U K, founder of UTHAKKAN.",
    "Ajmal U K (Creator, Owner, Developer)",
    "Ajmal U K",
    "UTHAKKAN is a modern, independent software development studio."
];

queries.forEach(query => {
    const terms = extractTerms(query);
    console.log(`\nQuery: "${query}"`);
    console.log(`Extracted Terms: [${terms.join(', ')}]`);
    testTexts.forEach(text => {
        const score = calculateTermRelevance(text, terms);
        console.log(`- Relevance for "${text}": ${score.toFixed(2)}`);
    });
});
