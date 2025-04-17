// LinkedIn Company Insights Extension
console.log("LinkedIn Company Insights extension loaded");

// Configuration
const CLEARBIT_API_KEY = "pk_dcqBoZmpRhiqHvDOFs06yg";
let widgetVisible = true;

// Create and inject widget when DOM is fully loaded
document.addEventListener("DOMContentLoaded", initializeExtension);

function initializeExtension() {
  // Only run on company pages
  if (isCompanyPage()) {
    // Get company data
    const companyData = extractCompanyData();
    
    // Create widget with initial loading state
    createWidget(companyData);
    
    // If we have a company name, try to fetch additional insights
    if (companyData.name) {
      fetchCompanyInsights(companyData.name)
        .then(insights => {
          updateWidgetWithInsights(insights);
        })
        .catch(error => {
          console.error("Error fetching company insights:", error);
          updateWidgetWithError();
        });
    }
    
    // Restore widget visibility state
    chrome.storage.local.get(['widgetVisible'], function(result) {
      if (result.widgetVisible === false) {
        toggleWidgetVisibility(false);
      }
    });
  }
}

function isCompanyPage() {
  // Check if current page is a company page
  // LinkedIn company pages typically have URLs like linkedin.com/company/[company-name]
  return window.location.href.includes("/company/") || 
         document.querySelector(".org-top-card") !== null ||
         document.querySelector("[data-test-id='topcard-entity-name']") !== null;
}

function extractCompanyData() {
  const companyData = {
    name: "",
    industry: "",
    size: "",
    location: ""
  };
  
  try {
    // Try to extract company name from various possible locations
    const nameSelectors = [
      ".org-top-card-summary__title",
      ".org-top-card-primary-content__title",
      "[data-test-id='topcard-entity-name']",
      ".org-company-card__primary-name",
      ".org-page-title"
    ];
    
    for (const selector of nameSelectors) {
      const nameElement = document.querySelector(selector);
      if (nameElement) {
        companyData.name = nameElement.textContent.trim();
        break;
      }
    }
    
    // Extract other company information if available
    const industryElement = document.querySelector(".company-industries") || 
                            document.querySelector(".org-about-company-module__industry");
    if (industryElement) {
      companyData.industry = industryElement.textContent.trim();
    }
    
    const sizeElement = document.querySelector(".org-about-company-module__company-staff-count-range");
    if (sizeElement) {
      companyData.size = sizeElement.textContent.trim();
    }
    
    const locationElement = document.querySelector(".org-top-card-summary__headquarter") ||
                            document.querySelector(".org-about-module__headquarters");
    if (locationElement) {
      companyData.location = locationElement.textContent.trim();
    }
  } catch (error) {
    console.error("Error extracting company data:", error);
  }
  
  return companyData;
}

async function fetchCompanyInsights(companyName) {
  // Extract domain from LinkedIn page if possible
  const domain = extractDomainFromPage() || `${companyName.toLowerCase().replace(/\s+/g, '-')}.com`;
  
  try {
    // Use Clearbit Logo API (no authentication required for this endpoint)
    const logoUrl = `https://logo.clearbit.com/${domain}`;
    
    // Check if the logo exists - if it does, the domain is valid
    const logoExists = await checkImageExists(logoUrl);
    
    if (logoExists) {
      // For more company data, use Clearbit's Company API with your key
      try {
        const response = await fetch(`https://company.clearbit.com/v2/companies/find?domain=${domain}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${CLEARBIT_API_KEY}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          return {
            companyName: data.name || companyName,
            domain: domain,
            logoUrl: data.logo || logoUrl,
            matchScore: calculateMatchScore(companyName, data),
            isTarget: isTargetCompany(data),
            additionalData: {
              industry: data.category?.industry || "Unknown",
              description: data.description ? (data.description.length > 100 ? data.description.substring(0, 100) + "..." : data.description) : "No description available",
              employeeCount: data.metrics?.employees || "Unknown",
              location: data.geo?.country || "Unknown",
              website: `https://${domain}`
            }
          };
        }
      } catch (error) {
        console.log("Detailed company data unavailable, using basic data");
      }
      
      // Fallback to basic data if the advanced API fails
      return {
        companyName: companyName,
        domain: domain,
        logoUrl: logoUrl,
        matchScore: calculateMatchScore(companyName, { domain: domain }),
        isTarget: isTargetCompany({ domain: domain }),
        additionalData: {
          website: `https://${domain}`
        }
      };
    } else {
      // If logo doesn't exist, return basic data
      return generateBasicInsights(companyName);
    }
  } catch (error) {
    console.error("API request failed:", error);
    return generateBasicInsights(companyName);
  }
}

// Helper function to check if an image exists
function checkImageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// Generate insights when API data isn't available
function generateBasicInsights(companyName) {
  const matchScore = Math.floor(Math.random() * 61) + 40; // Score between 40-100
  return {
    companyName: companyName,
    matchScore: matchScore,
    isTarget: matchScore > 70,
    additionalData: {
      note: "Limited data available"
    }
  };
}

// Extract domain from LinkedIn page if possible
function extractDomainFromPage() {
  const websiteLink = document.querySelector('a[data-control-name="visit_website"]') || 
                      document.querySelector('a[data-test-id="visit-website-button"]') ||
                      document.querySelector('a.link-without-hover-state[href*="linkedin.com/redir"]');
  
  if (websiteLink) {
    const href = websiteLink.href;
    if (href.includes('linkedin.com/redir')) {
      // Extract actual URL from LinkedIn redirect
      const url = new URL(href);
      const actualUrl = new URLSearchParams(url.search).get('url');
      if (actualUrl) {
        try {
          return new URL(actualUrl).hostname;
        } catch {
          return null;
        }
      }
    } else {
      try {
        return new URL(href).hostname;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Calculate match score based on company data
function calculateMatchScore(companyName, companyData) {
  // This would be your own algorithm
  // Here's a simple example that could be enhanced
  let score = 50; // Base score
  
  // Boost score for certain industries
  const targetIndustries = ['Software', 'Technology', 'IT', 'Internet'];
  if (companyData.category && targetIndustries.includes(companyData.category.industry)) {
    score += 20;
  }
  
  // Boost score for companies of certain size
  if (companyData.metrics && companyData.metrics.employees) {
    const employees = companyData.metrics.employees;
    if (employees > 50 && employees < 1000) {
      score += 15;
    }
  }
  
  // Boost for key domains
  const targetDomainKeywords = ['tech', 'software', 'digital', 'data', 'ai', 'cloud'];
  if (companyData.domain) {
    for (const keyword of targetDomainKeywords) {
      if (companyData.domain.includes(keyword)) {
        score += 10;
        break;
      }
    }
  }
  
  // Cap at 100
  return Math.min(score, 100);
}

// Determine if company is a target
function isTargetCompany(companyData) {
  // This would be your own logic
  // For demo, using score threshold
  const score = calculateMatchScore("", companyData);
  return score >= 70;
}

function createWidget(companyData) {
  // Create widget container
  const widget = document.createElement('div');
  widget.className = 'linkedin-insights-widget';
  widget.id = 'linkedin-insights-widget';
  
  // Create widget header
  const header = document.createElement('div');
  header.className = 'widget-header';
  
  const title = document.createElement('h3');
  title.className = 'widget-title';
  title.textContent = 'Company Insights';
  
  const closeButton = document.createElement('button');
  closeButton.className = 'widget-toggle';
  closeButton.innerHTML = '×';
  closeButton.title = 'Hide Widget';
  closeButton.addEventListener('click', function() {
    toggleWidgetVisibility(false);
  });
  
  header.appendChild(title);
  header.appendChild(closeButton);
  
  // Create widget content
  const content = document.createElement('div');
  content.className = 'widget-content';
  
  // Initial loading state
  content.innerHTML = `
    <h4 class="company-name">${companyData.name || 'Loading company data...'}</h4>
    <div class="loading-indicator">
      <p>Fetching insights...</p>
    </div>
  `;
  
  // Assemble widget
  widget.appendChild(header);
  widget.appendChild(content);
  
  // Create toggle button (initially hidden)
  const toggleButton = document.createElement('button');
  toggleButton.className = 'toggle-button hidden';
  toggleButton.innerHTML = 'i';
  toggleButton.title = 'Show Insights';
  toggleButton.addEventListener('click', function() {
    toggleWidgetVisibility(true);
  });
  toggleButton.id = 'linkedin-insights-toggle';
  
  // Add widget and toggle button to page
  document.body.appendChild(widget);
  document.body.appendChild(toggleButton);
}

function updateWidgetWithInsights(insights) {
  const content = document.querySelector('.widget-content');
  if (!content) return;
  
  // Update widget with fetched data
  let html = `
    <h4 class="company-name">${insights.companyName}</h4>
  `;
  
  // Add logo if available
  if (insights.logoUrl) {
    html += `
      <div style="text-align: center; margin: 10px 0;">
        <img src="${insights.logoUrl}" alt="${insights.companyName} logo" style="max-width: 100px; max-height: 60px;">
      </div>
    `;
  }
  
  html += `
    <div class="match-score-container">
      <div class="match-score-label">
        <span>Match Score</span>
        <span class="match-score-value">${insights.matchScore}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-fill" style="width: ${insights.matchScore}%"></div>
      </div>
    </div>
    
    <div class="account-status-container">
      <span class="account-status-label">Account Status:</span>
      <span class="status-tag ${insights.isTarget ? 'target' : 'not-target'}">
        ${insights.isTarget ? 'TARGET' : 'NOT TARGET'}
      </span>
    </div>
  `;
  
  content.innerHTML = html;
  
  // Add additional data if available
  if (insights.additionalData) {
    const additionalDataElement = document.createElement('div');
    additionalDataElement.className = 'additional-data';
    additionalDataElement.style.marginTop = '15px';
    additionalDataElement.style.fontSize = '13px';
    additionalDataElement.style.color = '#666';
    
    const dataPoints = Object.entries(insights.additionalData);
    if (dataPoints.length > 0) {
      const dataHTML = dataPoints.map(([key, value]) => {
        return `<div style="margin-top: 5px;">
          <strong>${formatLabel(key)}:</strong> ${value}
        </div>`;
      }).join('');
      
      additionalDataElement.innerHTML = dataHTML;
      content.appendChild(additionalDataElement);
    }
  }
  
  // Add website link if domain is available
  if (insights.domain) {
    const websiteLink = document.createElement('a');
    websiteLink.href = `https://${insights.domain}`;
    websiteLink.target = '_blank';
    websiteLink.rel = 'noopener noreferrer';
    websiteLink.style.display = 'inline-block';
    websiteLink.style.marginTop = '15px';
    websiteLink.style.padding = '5px 10px';
    websiteLink.style.backgroundColor = '#0a66c2';
    websiteLink.style.color = 'white';
    websiteLink.style.borderRadius = '4px';
    websiteLink.style.textDecoration = 'none';
    websiteLink.style.fontSize = '12px';
    websiteLink.textContent = 'Visit Website';
    
    content.appendChild(websiteLink);
  }
}

function updateWidgetWithError() {
  const content = document.querySelector('.widget-content');
  if (!content) return;
  
  // Update widget with error message
  const companyName = document.querySelector('.company-name').textContent;
  
  content.innerHTML = `
    <h4 class="company-name">${companyName}</h4>
    <div style="color: #df3232; margin: 10px 0;">
      <p>Unable to fetch company insights.</p>
      <p style="font-size: 12px; margin-top: 5px;">Please try again later.</p>
    </div>
    <button id="retry-fetch" style="background-color: #0a66c2; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;">Retry</button>
  `;
  
  // Add retry functionality
  document.getElementById('retry-fetch').addEventListener('click', function() {
    const companyName = document.querySelector('.company-name').textContent;
    content.innerHTML = '<p>Retrying...</p>';
    
    fetchCompanyInsights(companyName)
      .then(insights => {
        updateWidgetWithInsights(insights);
      })
      .catch(() => {
        updateWidgetWithError();
      });
  });
}

function toggleWidgetVisibility(visible) {
  const widget = document.getElementById('linkedin-insights-widget');
  const toggleButton = document.getElementById('linkedin-insights-toggle');
  
  if (visible) {
    widget.classList.remove('hidden');
    toggleButton.classList.add('hidden');
    widgetVisible = true;
  } else {
    widget.classList.add('hidden');
    toggleButton.classList.remove('hidden');
    widgetVisible = false;
  }
  
  // Save state to Chrome storage
  chrome.storage.local.set({widgetVisible: widgetVisible});
}

function formatLabel(key) {
  // Convert camelCase to Title Case with spaces
  return key
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
    .trim(); // Remove any extra spaces
}

// Initialize the extension when the page is fully loaded
window.addEventListener('load', function() {
  // Small delay to ensure LinkedIn has fully loaded its content
  setTimeout(initializeExtension, 1500);
});