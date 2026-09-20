export const verifierRequests = {
  "college-portal": {
    verifierId: "college-portal",
    verifier: "College Portal",
    purpose: "Confirm your student account details for campus access.",
    requestedFields: ["name", "studentId"],
    withheldFields: ["email", "dob", "phone"],
  },
  "student-services": {
    verifierId: "student-services",
    verifier: "Student Services",
    purpose: "Confirm the details needed to support your student request.",
    requestedFields: ["name", "studentId", "phone"],
  },
  "age-restricted-service": {
    verifierId: "age-restricted-service",
    verifier: "Age Restricted Service",
    purpose: "Confirm whether the user is over 18 without sharing their date of birth.",
    requestedFields: ["ageOver18"],
  },
};

export const identityFieldLabels = {
  name: "Name",
  email: "Email",
  college: "College",
  studentId: "Student ID",
  dob: "Date of Birth",
  phone: "Phone",
  ageOver18: "Age Over 18",
  assets: "Digital Assets & NFTs",
  nft: "NFT & Certificates",
};
