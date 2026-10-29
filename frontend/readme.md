frontend
│
├── analytics.html
├── chat.html
├── contributors.html
├── donate.html
├── features.index.html
├── home.html
├── index.html
├── login-form.html
├── other.html
├── profile.html
├── signup-form.html
├── soil-test.html
│
├── agroawareness/
│   └── index.agroawareness.html
│
├── agropedia/
│   ├── croprotation.html
│   ├── factors-crop-production.html
│   ├── fertilisers.html
│   ├── index.agropedia.html
│   ├── soilhealth.html
│   └── soiltypes.html
│
├── agroshop/
│   ├── index.agroshop.html
│   ├── script.js
│   └── styles.css
│
├── css.files/
│   ├── header-footer.css
│   ├── index.css
│   └── sign.css
│
├── img/
│   ├── abhinav.jpg
│   ├── agro-home.jpg
│   ├── agro-orders.png
│   ├── agroscan-icon.png
│   ├── agroscan-logo.png
│   ├── cropfac.jpg
│   ├── facebook-logo.png
│   ├── fertilisers.jpg
│   ├── instagram-logo.png
│   ├── linkedin-logo.png
│   ├── mill.jpg
│   ├── msg-logo.png
│   ├── obsorber.jpg
│   ├── profile-logo.jpg
│   ├── rain.mp4
│   ├── rotation.jpg
│   ├── soilhealth.jpg
│   ├── soilkit.jpg
│   ├── soiltypes.jpg
│   └── telegram-logo.png
│
└── js.files/
    └── head-foot.js

    AgroScan Frontend Documentation
Author: ABHINAV RANJAN & Team
Folder: frontend/
Purpose: Web client interface for AgroScan services including AI recommendations, agropedia, agro shop, soil tests, user profiles, chat, and analytics.
________________________________________
1. Root HTML Pages
File	Description
index.html	Main landing page with navigation to all sections.
home.html	Home page variant, may include featured content and AI recommendations.
features.index.html	Overview of AgroScan features.
analytics.html	Analytics dashboard for user data, crop statistics, and AI insights.
chat.html	Interface for AI chat, handles sending/receiving messages.
profile.html	Displays and allows editing of user profile information.
login-form.html	Collects credentials and authenticates users.
signup-form.html	Collects user details to create new accounts.
soil-test.html	Collects soil parameters and sends them for AI-based recommendations.
donate.html	Page for supporting AgroScan financially.
contributors.html	Lists developers and contributors.
other.html	Placeholder for miscellaneous content.
________________________________________
2. Subfolders
2.1 agroawareness/
File	Description
index.agroawareness.html	Educational content and awareness about sustainable farming practices.
2.2 agropedia/
File	Description
index.agropedia.html	Main agropedia landing page.
croprotation.html	Details on crop rotation techniques and benefits.
factors-crop-production.html	Explains factors affecting crop yield.
fertilisers.html	Information on fertilizers and their usage.
soilhealth.html	Guidelines for maintaining soil health.
soiltypes.html	Overview of different soil types and characteristics.
2.3 agroshop/
File	Description
index.agroshop.html	Online shop for agricultural products.
script.js	Handles frontend logic for cart, checkout, and product interactions.
styles.css	Styles specific to the agro shop pages.
2.4 css.files/
File	Description
header-footer.css	Shared header and footer styling across all pages.
index.css	General styling for homepage and global layout.
sign.css	Styling for login/signup forms.
2.5 js.files/
File	Description
head-foot.js	Handles dynamic rendering of header and footer, navigation, and user session checks.
________________________________________
3. General Notes
•	All pages maintain consistent header and footer from header-footer.css and head-foot.js.
•	Login and Signup pages connect to backend authentication endpoints.
•	Chat page interacts with AI backend for real-time conversation.
•	Soil test page sends user-provided data to AI recommendation system.
•	Agroshop pages manage cart, product listing, and order submission logic.
________________________________________

