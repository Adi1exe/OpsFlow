def register_and_login(client, email):
    client.post("/api/auth/register", json={
        "email": email,
        "full_name": "Ops User",
        "password": "SecurePass123!",
    })
    response = client.post("/api/auth/login", data={
        "username": email,
        "password": "SecurePass123!",
    })
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_stale_work_item_update_is_rejected_and_history_is_kept(client):
    headers = register_and_login(client, "owner@example.com")
    created = client.post("/api/work-items/", headers=headers, json={
        "title": "Review payment investigation",
        "priority": "high",
    })
    assert created.status_code == 201
    item = created.json()

    first = client.patch(f"/api/work-items/{item['id']}", headers=headers, json={
        "status": "in_progress", "version": item["version"],
    })
    assert first.status_code == 200
    assert first.json()["version"] == item["version"] + 1

    stale = client.patch(f"/api/work-items/{item['id']}", headers=headers, json={
        "priority": "urgent", "version": item["version"],
    })
    assert stale.status_code == 409

    activity = client.get(f"/api/work-items/{item['id']}/activity", headers=headers)
    assert activity.status_code == 200
    assert [entry["action"] for entry in activity.json()] == ["updated", "created"]


def test_private_work_is_not_visible_to_another_user(client):
    owner = register_and_login(client, "owner@example.com")
    other = register_and_login(client, "other@example.com")
    created = client.post("/api/work-items/", headers=owner, json={"title": "Private request"})
    item_id = created.json()["id"]

    assert client.get("/api/work-items/", headers=other).json() == []
    assert client.get(f"/api/work-items/{item_id}", headers=other).status_code == 404


def test_team_membership_grants_access_and_member_cannot_invite(client):
    admin = register_and_login(client, "admin@example.com")
    member = register_and_login(client, "member@example.com")
    team = client.post("/api/teams", headers=admin, json={"name": "Operations"})
    assert team.status_code == 201
    team_id = team.json()["id"]

    invite = client.post(f"/api/teams/{team_id}/members", headers=admin, json={
        "email": "member@example.com", "role": "member",
    })
    assert invite.status_code == 201
    item = client.post("/api/work-items/", headers=admin, json={
        "title": "Team request", "team_id": team_id,
    }).json()

    assert client.get(f"/api/work-items/{item['id']}", headers=member).status_code == 200
    assert client.post(f"/api/teams/{team_id}/members", headers=member, json={
        "email": "admin@example.com", "role": "member",
    }).status_code == 403
