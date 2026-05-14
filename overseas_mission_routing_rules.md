## RULE: AUTOMATED MISSION ROUTING & DATA EXTRACTION

1.  **IDENTIFY** the location city and country for the inquiry[cite: 2].
2.  **MANDATORY EXTRACTION**: For any mission identified as a coverage point, the system must automatically retrieve and display the following fields from `mission_routing_data.yaml`[cite: 1]:
    *   **Mission Name**[cite: 1]
    *   **Address**[cite: 1]
    *   **Phone & Emergency Contact**[cite: 1]
    *   **Website Link**[cite: 1]
3.  **IF** country has `honorary_offices` and `coverage_type: none`[cite: 1, 2]:
    *   Set the first listed honorary office as primary **COVERAGE** (include Website)[cite: 1, 2].
    *   List the `nearest_mission` under a section titled **NEAREST RESIDENT OFFICE** (include Website)[cite: 1, 2].
4.  **IF** country has `coverage_type: nearest_honorary`:
    *   Calculate distance to all listed `honorary_offices` and route to the **nearest** one.
5.  **IF** country has `coverage_type: nearest_office`:
    *   Calculate distance to all listed offices (including `primary_mission` and `honorary_offices`) and route to the **nearest** one.
6.  **IF** country is `cross_accredited_with_honorary`:
    *   Set the local listed `honorary_office` as primary **COVERAGE** (include Website).
    *   List the `accrediting_mission` under a section titled **SUPERVISING RESIDENT MISSION** (include Website).
7.  **IF** country is `cross_accredited`[cite: 1]:
    *   Set the `accrediting_mission` as primary **COVERAGE** and display its **Website** automatically[cite: 1].
7.  **ELSE** (Resident Missions)[cite: 1]:
    *   Route to the `primary_mission` or the specific mission for that region (e.g., Vietnam or UAE sub-national routing) and display its **Website**[cite: 1].
6.  **ALWAYS INCLUDE**: Regardless of the destination, append the **MFA HQ Consular Response Centre** details and the general **MFA Website**[cite: 1].

---

### USA SUB-NATIONAL COVERAGE REFERENCE

*   **Singapore Embassy in Washington DC**: Alabama, Arkansas, Delaware, Georgia, Illinois, Iowa, Kansas, Kentucky, Louisiana, Maryland, Minnesota, Mississippi, Missouri, Nebraska, North Carolina, North Dakota, Oklahoma, South Carolina, South Dakota, Tennessee, Texas, Virginia, West Virginia, Washington DC (District of Columbia), Puerto Rico, US Virgin Islands.
*   **Singapore Consulate-General in San Francisco**: Alaska, Arizona, California, Colorado, Hawaii, Idaho, Montana, Nevada, New Mexico, Oregon, Utah, Washington, Wyoming, all other US territories & outlying islands (Guam, American Samoa, Northern Mariana Islands, etc.).
*   **Singapore Consulate in New York**: Connecticut, Indiana, New Hampshire, New Jersey, New York, Maine, Massachusetts, Michigan, Ohio, Pennsylvania, Rhode Island, Vermont, Wisconsin.
*   **Singapore Honorary Consulate in Miami**: Florida.