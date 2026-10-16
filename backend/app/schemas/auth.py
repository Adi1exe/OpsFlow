from pydantic import BaseModel, ConfigDict, EmailStr, Field

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
