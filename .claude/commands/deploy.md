---
name: deploy
description: Generate deployment checklist and guide
aliases: [ship, release]
enabled: true
progressMessage: Preparing deployment guide...
argNames: [environment, version]
---

Generate a comprehensive deployment checklist for {environment} environment (version {version}):

**Pre-Deployment Checklist:**
- Code review completion status
- All tests passing verification
- Security scan results
- Performance benchmarks
- Database migration scripts ready
- Environment-specific configuration verified

**Deployment Steps:**
1. Backup current production state
2. Deploy to staging environment first
3. Run smoke tests and validation
4. Blue-green or rolling deployment strategy
5. Monitor key metrics during rollout
6. Rollback plan if issues detected

**Post-Deployment Verification:**
- Health checks and monitoring
- User acceptance testing
- Performance monitoring
- Error rate analysis
- Feature flag management

**Communication Plan:**
- Stakeholder notifications
- Documentation updates
- Team handoff procedures

Please analyze the current codebase and provide environment-specific deployment recommendations.