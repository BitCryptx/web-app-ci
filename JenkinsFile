pipeline {
    agent any

    environment {
        COMPOSE_FILE = 'docker-compose.yml'
    }

    stages {

        stage('Checkout') {
            steps {
                echo '>>> Fetching code from GitHub...'
                checkout scm
            }
        }

        stage('Verify Tools') {
            steps {
                echo '>>> Checking Docker and Compose versions...'
                sh 'docker --version'
                sh 'docker compose version'
            }
        }

        stage('Cleanup Previous Build') {
            steps {
                echo '>>> Removing old containers...'
                sh 'docker compose -f ${COMPOSE_FILE} down --remove-orphans || true'
            }
        }

        stage('Pull Base Images') {
            steps {
                echo '>>> Pulling latest base images...'
                sh 'docker compose -f ${COMPOSE_FILE} pull'
            }
        }

        stage('Build & Start Containers') {
            steps {
                echo '>>> Starting containers with volume-mounted code...'
                sh 'docker compose -f ${COMPOSE_FILE} up -d'
            }
        }

        stage('Verify Deployment') {
            steps {
                echo '>>> Checking running containers...'
                sh 'docker ps'
            }
        }
    }

    post {
        success {
            echo '✅ BUILD SUCCESSFUL - App is running in Docker!'
        }
        failure {
            echo '❌ BUILD FAILED - Check logs!'
            sh 'docker compose -f ${COMPOSE_FILE} logs || true'
        }
    }
}