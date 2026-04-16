from django.urls import path
from . import views

app_name = "server"

urlpatterns = [
    # Full page
    path("", views.index, name="index"),

    # Full page — configurations workspace (sidebar + create form)
    path("projects/", views.configurations_page, name="configurations_page"),

    # HTMX partials — project list
    path("projects/list/", views.project_list, name="project_list"),

    # HTMX partials — new configuration form (blank)
    path("projects/new/", views.project_new, name="project_new"),

    # HTMX partial — create a new project (POST only)
    path("projects/create/", views.project_create, name="project_create"),

    # HTMX partials — single project (GET = detail, POST = update)
    path("projects/<str:project_name>/", views.project_detail, name="project_detail"),

]
